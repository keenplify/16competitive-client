import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { getSavedCs16Executable } from './game/game-settings'

const LOBBY_MODEL_PREFIX = 'lobby/'
const LOBBY_MODEL_FILES = new Set([
  'arctic_lobby.mdl',
  'gign_lobby.mdl',
  'gsg9_lobby.mdl',
  'guerilla_lobby.mdl',
  'leet_lobby.mdl',
  'sas_lobby.mdl',
  'terror_lobby.mdl',
  'urban_lobby.mdl'
])

// Temporary development source for lobby previews. Installation detection will
// replace this with the player's selected Counter-Strike installation.
const isSafeModelPath = (relativePath: unknown): relativePath is string =>
  typeof relativePath === 'string' &&
  relativePath.length > 0 &&
  relativePath.length <= 240 &&
  !relativePath.includes('\0') &&
  relativePath.toLowerCase().endsWith('.mdl')

const normalizeModelPath = (relativePath: string): string => {
  const normalizedSeparators = relativePath.replace(/\\/g, '/')
  const pathWithinModelsDirectory = normalizedSeparators.replace(/^models\//i, '')
  return pathWithinModelsDirectory.split('/').join(sep)
}

// Buffer may be a view into a shared or pooled backing store, so copy exactly
// the file's bytes into a standalone ArrayBuffer before sending it over IPC.
const toArrayBuffer = (file: Buffer): ArrayBuffer => {
  const buffer = new ArrayBuffer(file.byteLength)
  new Uint8Array(buffer).set(file)
  return buffer
}

/**
 * Reads only MDLs contained in Counter-Strike's models directory. The renderer
 * supplies either a path relative to cstrike/models or a cstrike-relative path
 * beginning with models/. It never receives filesystem access.
 */
export const readCounterStrikeModel = async (relativePath: unknown): Promise<ArrayBuffer> => {
  if (!isSafeModelPath(relativePath)) {
    throw new Error('A relative .mdl model path is required')
  }

  if (relativePath.startsWith(LOBBY_MODEL_PREFIX)) {
    const fileName = relativePath.slice(LOBBY_MODEL_PREFIX.length)
    if (!LOBBY_MODEL_FILES.has(fileName)) throw new Error('Unknown bundled lobby model')
    const lobbyModelsDirectory = app.isPackaged
      ? join(process.resourcesPath, 'lobby-models')
      : join(app.getAppPath(), 'resources', 'lobby-models')
    const file = await readFile(join(lobbyModelsDirectory, fileName))
    return toArrayBuffer(file)
  }

  const executable = await getSavedCs16Executable()
  if (!executable) {
    throw new Error('Choose your Counter-Strike executable in Settings first')
  }
  const gameRoot = dirname(executable)
  const modelPath = normalizeModelPath(relativePath)
  const candidates = [
    resolve(join(gameRoot, '16competitive', 'models'), modelPath),
    resolve(join(gameRoot, 'cstrike', 'models'), modelPath)
  ]
  const allowedRoots = [
    resolve(join(gameRoot, '16competitive', 'models')),
    resolve(join(gameRoot, 'cstrike', 'models'))
  ]
  if (
    candidates.some((candidate, index) => !candidate.startsWith(`${allowedRoots[index]}${sep}`))
  ) {
    throw new Error('Model path must stay inside a managed Counter-Strike models directory')
  }

  let file: Buffer | null = null
  for (const candidate of candidates) {
    file = await readFile(candidate).catch(() => null)
    if (file) break
  }
  if (!file) throw new Error('Counter-Strike model was not found in 16competitive or cstrike')
  console.info('[Models] Loaded Counter-Strike model', {
    relativePath,
    bytes: file.byteLength
  })

  return toArrayBuffer(file)
}
