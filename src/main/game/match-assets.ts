import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getSessionToken } from '../auth'
import { getSavedCs16Executable } from './game-settings'

const ASSET_PATH =
  /^models\/16competitive\/[a-z0-9_]+\/([a-f0-9]{16,64})\/(view|player|world|v|p|w)\.mdl$/
const SHA256 = /^[a-f0-9]{64}$/
const MAX_MODEL_SIZE = 20 * 1024 * 1024
const DOWNLOAD_CONCURRENCY = 3
const MANIFEST_RETRY_COUNT = 30
const MANIFEST_RETRY_DELAY_MS = 1_000

interface MatchAsset {
  path: string
  sha256?: string
}

interface MatchAssetsResponse {
  assets: MatchAsset[]
}

const preloads = new Map<string, Promise<void>>()

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

const downloadAsset = async (
  apiUrl: URL,
  matchId: string,
  asset: MatchAsset,
  token: string,
  assetRoot: string
): Promise<void> => {
  const destination = destinationFor(assetRoot, asset.path)
  const expectedHash = expectedHashFor(asset)
  if (await hasExpectedHash(destination, expectedHash)) return

  const url = new URL(`/matches/${encodeURIComponent(matchId)}/assets/file`, apiUrl)
  url.searchParams.set('path', asset.path)
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(45_000)
  })
  if (!response.ok) throw new Error(`Could not download ${asset.path} (${response.status}).`)
  if (!response.headers.get('content-type')?.startsWith('application/octet-stream')) {
    throw new Error(`Match asset server returned an invalid content type for ${asset.path}.`)
  }
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && (contentLength < 16 || contentLength > MAX_MODEL_SIZE)) {
    throw new Error(`Match asset has an unsupported size: ${asset.path}`)
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

  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  const temporary = `${destination}.${randomUUID()}.partial`
  try {
    await writeFile(temporary, bytes, { mode: 0o600 })
    await rename(temporary, destination)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

const runWithConcurrency = async (tasks: Array<() => Promise<void>>): Promise<void> => {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const task = tasks[next++]
      await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, tasks.length) }, worker))
}

const loadManifest = async (manifestUrl: URL, token: string): Promise<MatchAssetsResponse> => {
  for (let attempt = 0; attempt < MANIFEST_RETRY_COUNT; attempt += 1) {
    const response = await fetch(manifestUrl, {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000)
    })
    if (response.ok) {
      const payload: unknown = await response.json().catch(() => null)
      if (!isMatchAssetsResponse(payload)) throw new Error('Match asset manifest is invalid.')
      return payload
    }
    // A match can be assigned just before its asset authorization record is
    // visible on the regional API. Keep preparing rather than falling back to
    // GoldSrc's slow in-game downloads.
    if (response.status !== 404 || attempt === MANIFEST_RETRY_COUNT - 1) {
      throw new Error(`Could not load required match assets (${response.status}).`)
    }
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, MANIFEST_RETRY_DELAY_MS))
  }
  throw new Error('Could not load required match assets.')
}

const preload = async (matchId: string, hostApiUrl: string): Promise<void> => {
  if (!/^[a-z0-9-]{36}$/i.test(matchId)) throw new Error('Invalid match ID for asset download.')
  const token = getSessionToken()
  if (!token) throw new Error('Sign in again before downloading match assets.')
  const apiUrl = new URL(hostApiUrl)
  if (!['https:', 'http:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password) {
    throw new Error('Match asset server URL is invalid.')
  }
  const assetRoot = join(await getGameDirectory(), 'cstrike')
  const manifestUrl = new URL(`/matches/${encodeURIComponent(matchId)}/assets`, apiUrl)
  const payload = await loadManifest(manifestUrl, token)

  const uniqueAssets = new Map<string, MatchAsset>()
  for (const asset of payload.assets) {
    destinationFor(assetRoot, asset.path)
    expectedHashFor(asset)
    if (uniqueAssets.has(asset.path))
      throw new Error(`Match manifest has a duplicate asset: ${asset.path}`)
    uniqueAssets.set(asset.path, asset)
  }
  console.info('[MatchAssets] preparing match assets', { matchId, count: uniqueAssets.size })
  await runWithConcurrency(
    [...uniqueAssets.values()].map(
      (asset) => () => downloadAsset(apiUrl, matchId, asset, token, assetRoot)
    )
  )
  console.info('[MatchAssets] match assets ready', { matchId, count: uniqueAssets.size })
}

export const startMatchAssetPreload = (matchId: string, hostApiUrl: string): Promise<void> => {
  const current = preloads.get(matchId)
  if (current) return current
  const task = preload(matchId, hostApiUrl)
  preloads.set(matchId, task)
  return task
}

export const waitForMatchAssetPreload = async (matchId: string): Promise<void> => {
  const task = preloads.get(matchId)
  if (!task) throw new Error('Required match asset preload did not start.')
  await task
}

export const clearMatchAssetPreload = (matchId: string): void => {
  preloads.delete(matchId)
}
