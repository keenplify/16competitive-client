import { app } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppUpdateStatus } from '../shared/updater'
import releaseConfig from '../../helper-release.json'
import {
  newerVersion,
  recoverRendererState,
  verifyRendererBytes,
  verifyRendererEnvelope,
  type RendererUpdateManifest,
  type RendererUpdateState,
  type SignedRendererUpdate
} from '../shared/renderer-update'

const officialReleases = 'https://github.com/keenplify/16competitive-client/releases/download'
const root = (): string => join(app.getPath('userData'), 'renderer-updates')
const archive = (m: RendererUpdateManifest): string => join(root(), `${m.sha256}.asar`)
const runtimePath = (): string => join(process.resourcesPath, 'renderer-runtime.json')
let currentVersion: string | null = null

export function supportsRendererUpdates(): boolean {
  return app.isPackaged && process.platform === 'win32' && existsSync(runtimePath())
}

export function effectiveClientVersion(): string {
  return currentVersion ?? app.getVersion()
}

function readState(): RendererUpdateState {
  try {
    const path = join(root(), 'state.json')
    if (!lstatSync(path).isFile() || lstatSync(path).size > 65_536) return {}
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as RendererUpdateState
  } catch {
    return {}
  }
}

function writeState(state: RendererUpdateState): void {
  mkdirSync(root(), { recursive: true })
  const temporary = join(root(), `state-${randomUUID()}.tmp`)
  writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
  renameSync(temporary, join(root(), 'state.json'))
}

function compatible(m: RendererUpdateManifest): boolean {
  const runtime = JSON.parse(readFileSync(runtimePath(), 'utf8')) as { compatibility?: unknown }
  return m.arch === process.arch && m.compatibility === runtime.compatibility
}

function verified(envelope: SignedRendererUpdate): RendererUpdateManifest {
  const m = verifyRendererEnvelope(envelope, releaseConfig.publicKeyPem)
  if (!compatible(m)) throw new Error('Renderer update requires a full installer.')
  const metadata = lstatSync(archive(m))
  if (!metadata.isFile() || metadata.size !== m.size) throw new Error('Invalid renderer archive.')
  verifyRendererBytes(readFileSync(archive(m)), m)
  return m
}

/** Runs after the single-instance lock and before loading any renderer code. */
export function selectRendererEntry(installedEntry: string): string {
  if (!supportsRendererUpdates()) return installedEntry
  let state = recoverRendererState(readState())
  try {
    // A full installer supersedes cached renderers and may change the runtime.
    // Discard those records before considering a new compatible payload.
    let baseline = app.getVersion()
    if (state.active) {
      try {
        const active = verified(state.active)
        if (newerVersion(active.version, baseline)) baseline = active.version
        else {
          delete state.active
          delete state.previous
        }
      } catch {
        delete state.active
        delete state.previous
      }
    }
    if (state.failedVersion && !newerVersion(state.failedVersion, app.getVersion()))
      delete state.failedVersion
    if (state.pending) {
      const m = verified(state.pending)
      if (newerVersion(m.version, baseline) && m.version !== state.failedVersion) {
        state = {
          active: state.pending,
          previous: state.active,
          launching: m.version,
          failedVersion: state.failedVersion
        }
      } else delete state.pending
    }
    writeState(state)
    if (!state.active) return installedEntry
    const m = verified(state.active)
    if (!newerVersion(m.version, app.getVersion())) return installedEntry
    currentVersion = m.version
    return join(archive(m), 'index.html')
  } catch (error) {
    console.error('[RendererUpdate] Falling back to installed renderer:', error)
    writeState(
      recoverRendererState({
        ...state,
        launching: state.launching ?? state.failedVersion,
        pending: undefined
      })
    )
    return installedEntry
  }
}

/** A React mount confirms that both preload and the renderer actually started. */
export function confirmRendererStartup(): void {
  if (!supportsRendererUpdates() || !currentVersion) return
  const state = readState()
  if (state.launching !== currentVersion) return
  delete state.launching
  writeState(state)
  try {
    const retained = new Set(
      [state.active, state.previous, state.pending]
        .filter(Boolean)
        .map(
          (envelope) =>
            `${verifyRendererEnvelope(envelope, releaseConfig.publicKeyPem).sha256}.asar`
        )
    )
    for (const name of readdirSync(root())) {
      if (/^[a-f0-9]{64}\.asar$/.test(name) && !retained.has(name)) unlinkSync(join(root(), name))
    }
  } catch (error) {
    console.warn('[RendererUpdate] Old renderer cleanup failed:', error)
  }
}

export function rollbackRendererStartup(): boolean {
  if (!supportsRendererUpdates()) return false
  const state = readState()
  if (!state.launching) return false
  writeState(recoverRendererState(state))
  return true
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Empty renderer update metadata.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 16_384) throw new Error('Renderer update metadata is too large.')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** False means the release needs the normal platform updater. Invalid signatures throw. */
export async function stageRendererUpdate(
  version: string,
  progress: (value: Pick<Extract<AppUpdateStatus, { state: 'downloading' }>, 'percent' | 'downloadedBytes' | 'totalBytes' | 'bytesPerSecond'>) => void
): Promise<boolean> {
  if (!supportsRendererUpdates() || !newerVersion(version, effectiveClientVersion())) return false
  if (readState().failedVersion === version) return false
  const base = `${officialReleases}/v${version}/`
  const response = await fetch(`${base}renderer-update-win-${process.arch}.json`, {
    signal: AbortSignal.timeout(15_000)
  })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`Renderer update metadata unavailable (${response.status}).`)
  const envelope = (await boundedJson(response)) as SignedRendererUpdate
  const m = verifyRendererEnvelope(envelope, releaseConfig.publicKeyPem)
  if (m.version !== version) throw new Error('Renderer update version mismatch.')
  if (!compatible(m)) return false
  await mkdir(root(), { recursive: true })
  const temporary = join(root(), `${randomUUID()}.tmp`)
  const responseFile = await fetch(`${base}${m.file}`, { signal: AbortSignal.timeout(5 * 60_000) })
  if (!responseFile.ok || !responseFile.body)
    throw new Error('Renderer update download unavailable.')
  const handle = await open(temporary, 'wx', 0o600)
  const reader = responseFile.body.getReader()
  try {
    let bytes = 0
    const startedAt = Date.now()
    const hash = createHash('sha256')
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > m.size) throw new Error('Renderer update exceeds its signed size.')
      hash.update(value)
      let offset = 0
      while (offset < value.length) {
        const result = await handle.write(value, offset, value.length - offset)
        if (!result.bytesWritten) throw new Error('Renderer update write failed.')
        offset += result.bytesWritten
      }
      progress({
        percent: Math.min(99, Math.floor((bytes / m.size) * 100)),
        downloadedBytes: bytes,
        totalBytes: m.size,
        bytesPerSecond: (bytes * 1_000) / Math.max(1, Date.now() - startedAt)
      })
    }
    if (bytes !== m.size || hash.digest('hex') !== m.sha256)
      throw new Error('Renderer update failed verification.')
    await handle.sync()
    await handle.close()
    let reusable = false
    try {
      if (lstatSync(archive(m)).isFile()) {
        verifyRendererBytes(await readFile(archive(m)), m)
        reusable = true
      }
    } catch {
      /* Replace corrupt cached data with the verified download. */
    }
    if (!reusable) await rename(temporary, archive(m))
    verifyRendererBytes(await readFile(archive(m)), m)
    writeState({ ...readState(), pending: envelope })
    progress({
      percent: 100,
      downloadedBytes: bytes,
      totalBytes: m.size,
      bytesPerSecond: (bytes * 1_000) / Math.max(1, Date.now() - startedAt)
    })
    return true
  } finally {
    await handle.close().catch(() => undefined)
    await reader.cancel().catch(() => undefined)
    await rm(temporary, { force: true })
  }
}
