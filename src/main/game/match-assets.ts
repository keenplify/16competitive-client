import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getSessionToken } from '../auth'
import { getSavedCs16Executable } from './game-settings'

const ASSET_PATH =
  /^models\/16competitive\/[a-z0-9_]+\/([a-f0-9]{16,64})\/(view|player|world|v|p|w)\.mdl$/
const SHA256 = /^[a-f0-9]{64}$/
const MAX_MODEL_SIZE = 20 * 1024 * 1024
// Some players connect over high-latency or lossy routes. Fetching the three
// GoldSrc models at once made one request prone to stalling behind the others.
// Keep the transfer small and give each model several bounded chances instead.
const DOWNLOAD_CONCURRENCY = 1
const ASSET_DOWNLOAD_RETRY_COUNT = 20
// The largest model is only a few hundred KB, but long-distance routes can
// take longer than 15 seconds to receive its complete response. Keep a bounded
// timeout without rejecting a usable slow connection.
const ASSET_DOWNLOAD_TIMEOUT_MS = 90_000
const ASSET_DOWNLOAD_RETRY_DELAY_MS = 1_000
const ASSET_DOWNLOAD_RETRY_MAX_DELAY_MS = 5_000
const MANIFEST_RETRY_COUNT = 60
const MANIFEST_RETRY_DELAY_MS = 1_000
const MANIFEST_RETRY_MAX_DELAY_MS = 5_000
const CATALOG_ASSET_PATH = /^models\/16competitive\/[a-zA-Z0-9_/-]+\.mdl$/

interface MatchAsset {
  path: string
  sha256?: string
}

interface MatchAssetsResponse {
  assets: MatchAsset[]
}

export interface MatchAssetPreloadProgress {
  status: 'checking' | 'downloading' | 'ready'
  completedFiles: number
  totalFiles: number
}

class NonRetryableAssetError extends Error {}

const preloads = new Map<string, Promise<void>>()
const preloadControllers = new Map<string, AbortController>()

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

const retryDelay = (baseDelay: number, maxDelay: number, attempt: number): number =>
  Math.min(baseDelay * attempt, maxDelay)

const isRetryableHttpStatus = (status: number): boolean =>
  status === 404 || status === 408 || status === 425 || status === 429 || status >= 500

const isMatchAsset = (value: unknown): value is MatchAsset => {
  if (typeof value !== 'object' || value === null) return false
  const asset = value as Record<string, unknown>
  return (
    typeof asset.path === 'string' &&
    (asset.sha256 === undefined || (typeof asset.sha256 === 'string' && SHA256.test(asset.sha256)))
  )
}

const isMatchAssetsResponse = (value: unknown): value is MatchAssetsResponse => {
  if (typeof value !== 'object' || value === null) return false
  const assets = (value as Record<string, unknown>).assets
  return Array.isArray(assets) && assets.every(isMatchAsset)
}

const getGameDirectory = async (): Promise<string> => {
  const executable = (await getSavedCs16Executable()) ?? process.env.CS16_CLIENT_EXECUTABLE_PATH
  if (!executable || !isAbsolute(executable)) {
    throw new Error('Choose your Counter-Strike executable in Settings before joining a match.')
  }
  const gameDirectory = process.env.CS16_CLIENT_GAME_DIRECTORY
    ? resolve(process.env.CS16_CLIENT_GAME_DIRECTORY)
    : dirname(resolve(executable))
  if (!(await stat(gameDirectory).catch(() => null))?.isDirectory()) {
    throw new Error('The configured Counter-Strike game directory was not found.')
  }
  return gameDirectory
}

const destinationFor = (assetRoot: string, assetPath: string): string => {
  if (!ASSET_PATH.test(assetPath))
    throw new Error(`Match manifest contains an unsafe asset path: ${assetPath}`)
  const destination = resolve(assetRoot, assetPath)
  if (relative(assetRoot, destination).startsWith('..')) {
    throw new Error(`Match manifest asset escapes the game directory: ${assetPath}`)
  }
  return destination
}

const catalogDestinationFor = (assetRoot: string, assetPath: string): string => {
  if (!CATALOG_ASSET_PATH.test(assetPath) || assetPath.includes('..'))
    throw new Error(`Skin catalog contains an unsafe asset path: ${assetPath}`)
  const destination = resolve(assetRoot, assetPath)
  if (relative(assetRoot, destination).startsWith('..'))
    throw new Error(`Skin catalog asset escapes the game directory: ${assetPath}`)
  return destination
}

const expectedHashFor = (asset: MatchAsset): string => {
  const pathHash = ASSET_PATH.exec(asset.path)?.[1]
  if (!pathHash) throw new Error(`Match manifest contains an unsafe asset path: ${asset.path}`)
  if (asset.sha256 && !asset.sha256.startsWith(pathHash)) {
    throw new Error(`Match manifest hash does not match its asset path: ${asset.path}`)
  }
  return asset.sha256 ?? pathHash
}

const hasExpectedHash = async (destination: string, expectedHash: string): Promise<boolean> => {
  const metadata = await stat(destination).catch(() => null)
  if (!metadata?.isFile() || metadata.size < 16 || metadata.size > MAX_MODEL_SIZE) return false
  const bytes = await readFile(destination).catch(() => null)
  if (!bytes) return false
  const actualHash = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
  return actualHash.startsWith(expectedHash)
}

const fetchAssetBytes = async (
  apiUrl: URL,
  matchId: string,
  asset: MatchAsset,
  token: string,
  expectedHash: string,
  signal: AbortSignal
): Promise<Buffer> => {
  const url = new URL(`/matches/${encodeURIComponent(matchId)}/assets/file`, apiUrl)
  url.searchParams.set('path', asset.path)

  for (let attempt = 1; attempt <= ASSET_DOWNLOAD_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(ASSET_DOWNLOAD_TIMEOUT_MS)])
      })
      if (!response.ok) {
        const error = new Error(`Could not download ${asset.path} (${response.status}).`)
        if (!isRetryableHttpStatus(response.status)) {
          throw new NonRetryableAssetError(error.message)
        }
        throw error
      }
      if (!response.headers.get('content-type')?.startsWith('application/octet-stream')) {
        throw new NonRetryableAssetError(
          `Match asset server returned an invalid content type for ${asset.path}.`
        )
      }
      const contentLength = Number(response.headers.get('content-length'))
      if (
        Number.isFinite(contentLength) &&
        (contentLength < 16 || contentLength > MAX_MODEL_SIZE)
      ) {
        throw new NonRetryableAssetError(`Match asset has an unsupported size: ${asset.path}`)
      }

      const bytes = Buffer.from(await response.arrayBuffer())
      if (
        bytes.length < 16 ||
        bytes.length > MAX_MODEL_SIZE ||
        bytes.subarray(0, 4).toString() !== 'IDST'
      ) {
        throw new Error(`Match asset is not a valid GoldSrc model: ${asset.path}`)
      }
      const actualHash = createHash('sha256').update(bytes).digest('hex')
      if (!actualHash.startsWith(expectedHash)) {
        throw new Error(`Match asset integrity check failed: ${asset.path}`)
      }
      return bytes
    } catch (error) {
      if (signal.aborted) {
        throw new NonRetryableAssetError('Match asset download was cancelled.')
      }
      if (error instanceof NonRetryableAssetError || attempt === ASSET_DOWNLOAD_RETRY_COUNT) {
        throw error
      }
      console.warn('[MatchAssets] asset download failed; retrying', {
        matchId,
        path: asset.path,
        attempt,
        maxAttempts: ASSET_DOWNLOAD_RETRY_COUNT,
        error: error instanceof Error ? error.message : String(error)
      })
      await delay(
        retryDelay(
          ASSET_DOWNLOAD_RETRY_DELAY_MS,
          ASSET_DOWNLOAD_RETRY_MAX_DELAY_MS,
          attempt
        )
      )
    }
  }

  throw new Error(`Could not download ${asset.path}.`)
}

const downloadAsset = async (
  apiUrl: URL,
  matchId: string,
  asset: MatchAsset,
  token: string,
  assetRoot: string,
  signal: AbortSignal
): Promise<void> => {
  const destination = destinationFor(assetRoot, asset.path)
  const expectedHash = expectedHashFor(asset)
  if (await hasExpectedHash(destination, expectedHash)) return

  const bytes = await fetchAssetBytes(apiUrl, matchId, asset, token, expectedHash, signal)
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  const temporary = `${destination}.${randomUUID()}.partial`
  try {
    await writeFile(temporary, bytes, { mode: 0o600 })
    await rename(temporary, destination)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

export interface SkinAssetSyncProgress {
  status: 'syncing' | 'ready' | 'error'
  completedFiles: number
  totalFiles: number
  message?: string
}

interface CatalogAsset {
  path: string
}

let skinSyncTask: Promise<void> | null = null

const syncSkinAssets = async (
  apiUrl: string,
  onProgress: (progress: SkinAssetSyncProgress) => void
): Promise<void> => {
  const token = getSessionToken()
  if (!token) return
  const base = new URL(apiUrl)
  const response = await fetch(new URL('/skins/assets', base), {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) throw new Error(`Could not load skin asset catalog (${response.status}).`)
  const payload: unknown = await response.json().catch(() => null)
  const assets =
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as { assets?: unknown }).assets)
      ? (payload as { assets: unknown[] }).assets
      : []
  const catalog = assets.filter(
    (asset): asset is CatalogAsset =>
      typeof asset === 'object' &&
      asset !== null &&
      typeof (asset as { path?: unknown }).path === 'string'
  )
  const assetRoot = join(await getGameDirectory(), 'cstrike')
  let completedFiles = 0
  onProgress({ status: 'syncing', completedFiles, totalFiles: catalog.length })
  await runWithConcurrency(
    catalog.map((asset) => async () => {
      const destination = catalogDestinationFor(assetRoot, asset.path)
      if (!(await hasExpectedHash(destination, ''))) {
        const fileUrl = new URL('/skins/assets/file', base)
        fileUrl.searchParams.set('path', asset.path)
        const result = await fetch(fileUrl, {
          headers: { authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(90_000)
        })
        if (!result.ok) throw new Error(`Could not download ${asset.path} (${result.status}).`)
        const bytes = Buffer.from(await result.arrayBuffer())
        if (
          bytes.length < 16 ||
          bytes.length > MAX_MODEL_SIZE ||
          bytes.subarray(0, 4).toString() !== 'IDST'
        )
          throw new Error(`Skin asset is not a valid GoldSrc model: ${asset.path}`)
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
        const temporary = `${destination}.${randomUUID()}.partial`
        try {
          await writeFile(temporary, bytes, { mode: 0o600 })
          await rename(temporary, destination)
        } finally {
          await unlink(temporary).catch(() => undefined)
        }
      }
      completedFiles += 1
      onProgress({ status: 'syncing', completedFiles, totalFiles: catalog.length })
    })
  )
  onProgress({ status: 'ready', completedFiles: catalog.length, totalFiles: catalog.length })
}

export const startSkinAssetSync = (
  apiUrl: string,
  onProgress: (progress: SkinAssetSyncProgress) => void
): Promise<void> => {
  if (skinSyncTask) return skinSyncTask
  skinSyncTask = syncSkinAssets(apiUrl, onProgress)
    .catch((error: unknown) => {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : ''
      const message =
        code === 'EACCES' || code === 'EPERM' || code === 'EROFS'
          ? 'Counter-Strike folder is not writable. Check its permissions in Settings.'
          : error instanceof Error &&
              error.message.includes('Choose your Counter-Strike executable')
            ? 'Choose your Counter-Strike executable in Settings to download skin assets.'
            : 'Could not download skin assets. Check your connection and try again.'
      onProgress({ status: 'error', completedFiles: 0, totalFiles: 0, message })
      throw error
    })
    .finally(() => {
      skinSyncTask = null
    })
  return skinSyncTask
}

const runWithConcurrency = async (tasks: Array<() => Promise<void>>): Promise<void> => {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const task = tasks[next++]
      await task()
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, tasks.length) }, worker)
  )
}

const loadManifest = async (
  manifestUrl: URL,
  token: string,
  signal: AbortSignal
): Promise<MatchAssetsResponse> => {
  for (let attempt = 1; attempt <= MANIFEST_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(manifestUrl, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      })
      if (response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        if (!isMatchAssetsResponse(payload)) {
          throw new NonRetryableAssetError('Match asset manifest is invalid.')
        }
        return payload
      }

      // A match can be assigned just before its asset authorization record is
      // visible on the regional API. Network outages, rate limits and temporary
      // server failures should also keep retrying while the match remains active.
      if (!isRetryableHttpStatus(response.status)) {
        throw new NonRetryableAssetError(
          `Could not load required match assets (${response.status}).`
        )
      }
      if (attempt === MANIFEST_RETRY_COUNT) {
        throw new Error(`Could not load required match assets (${response.status}).`)
      }
    } catch (error) {
      if (signal.aborted) {
        throw new NonRetryableAssetError('Match asset download was cancelled.')
      }
      if (error instanceof NonRetryableAssetError || attempt === MANIFEST_RETRY_COUNT) {
        throw error
      }
      console.warn('[MatchAssets] manifest request failed; retrying', {
        url: manifestUrl.toString(),
        attempt,
        maxAttempts: MANIFEST_RETRY_COUNT,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    await delay(retryDelay(MANIFEST_RETRY_DELAY_MS, MANIFEST_RETRY_MAX_DELAY_MS, attempt))
  }
  throw new Error('Could not load required match assets.')
}

const preload = async (
  matchId: string,
  hostApiUrl: string,
  onProgress: ((progress: MatchAssetPreloadProgress) => void) | undefined,
  signal: AbortSignal
): Promise<void> => {
  if (!/^[a-z0-9-]{36}$/i.test(matchId)) throw new Error('Invalid match ID for asset download.')
  const token = getSessionToken()
  if (!token) throw new Error('Sign in again before downloading match assets.')
  const apiUrl = new URL(hostApiUrl)
  if (!['https:', 'http:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password) {
    throw new Error('Match asset server URL is invalid.')
  }
  const assetRoot = join(await getGameDirectory(), 'cstrike')
  const manifestUrl = new URL(`/matches/${encodeURIComponent(matchId)}/assets`, apiUrl)
  onProgress?.({ status: 'checking', completedFiles: 0, totalFiles: 0 })
  const payload = await loadManifest(manifestUrl, token, signal)

  const uniqueAssets = new Map<string, MatchAsset>()
  for (const asset of payload.assets) {
    destinationFor(assetRoot, asset.path)
    expectedHashFor(asset)
    if (uniqueAssets.has(asset.path))
      throw new Error(`Match manifest has a duplicate asset: ${asset.path}`)
    uniqueAssets.set(asset.path, asset)
  }
  console.info('[MatchAssets] preparing match assets', { matchId, count: uniqueAssets.size })
  let completedFiles = 0
  const totalFiles = uniqueAssets.size
  onProgress?.({ status: 'downloading', completedFiles, totalFiles })
  await runWithConcurrency(
    [...uniqueAssets.values()].map((asset) => async () => {
      await downloadAsset(apiUrl, matchId, asset, token, assetRoot, signal)
      completedFiles += 1
      onProgress?.({ status: 'downloading', completedFiles, totalFiles })
    })
  )
  console.info('[MatchAssets] match assets ready', { matchId, count: uniqueAssets.size })
  onProgress?.({ status: 'ready', completedFiles: totalFiles, totalFiles })
}

export const startMatchAssetPreload = (
  matchId: string,
  hostApiUrl: string,
  onProgress?: (progress: MatchAssetPreloadProgress) => void
): Promise<void> => {
  const current = preloads.get(matchId)
  if (current) return current
  const controller = new AbortController()
  const task = preload(matchId, hostApiUrl, onProgress, controller.signal)
  preloads.set(matchId, task)
  preloadControllers.set(matchId, controller)
  void task.then(
    () => {
      if (preloadControllers.get(matchId) === controller) {
        preloadControllers.delete(matchId)
      }
    },
    () => {
      // Do not leave a rejected preload cached. After connectivity returns the
      // recovered match_connect event must be able to start a fresh preload.
      if (preloads.get(matchId) === task) preloads.delete(matchId)
      if (preloadControllers.get(matchId) === controller) {
        preloadControllers.delete(matchId)
      }
    }
  )
  return task
}

export const waitForMatchAssetPreload = async (matchId: string): Promise<void> => {
  const task = preloads.get(matchId)
  if (!task) throw new Error('Required match asset preload did not start.')
  await task
}

export const clearMatchAssetPreload = (matchId: string): void => {
  preloadControllers.get(matchId)?.abort()
  preloadControllers.delete(matchId)
  preloads.delete(matchId)
}
