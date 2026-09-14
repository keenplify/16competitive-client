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
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
  }

  const executable = await getSavedCs16Executable()
  if (!executable) {
    throw new Error('Choose your Counter-Strike executable in Settings first')
  }
  const modelsDirectory = resolve(join(dirname(executable), 'cstrike', 'models'))
  const modelPath = normalizeModelPath(relativePath)
  const resolvedPath = resolve(modelsDirectory, modelPath)
  if (!resolvedPath.startsWith(`${modelsDirectory}${sep}`)) {
    throw new Error('Model path must stay inside the Counter-Strike models directory')
  }

  const file = await readFile(resolvedPath)
  console.info('[Models] Loaded Counter-Strike model', {
    relativePath,
    bytes: file.byteLength
  })

  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
}
