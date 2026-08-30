import { readFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { getSavedCs16Executable } from './game/game-settings'

// Temporary development source for lobby previews. Installation detection will
// replace this with the player's selected Counter-Strike installation.
const isSafeModelPath = (relativePath: unknown): relativePath is string =>
  typeof relativePath === 'string' &&
  relativePath.length > 0 &&
  relativePath.length <= 240 &&
  !relativePath.includes('\0') &&
  relativePath.toLowerCase().endsWith('.mdl')

/**
 * Reads only MDLs contained in Counter-Strike's models directory. The renderer
 * supplies a relative asset path and never receives filesystem access.
 */
export const readCounterStrikeModel = async (relativePath: unknown): Promise<ArrayBuffer> => {
  if (!isSafeModelPath(relativePath)) {
    throw new Error('A relative .mdl model path is required')
  }

  const executable = await getSavedCs16Executable()
  if (!executable) {
    throw new Error('Choose your Counter-Strike executable in Settings first')
  }
  const modelsDirectory = resolve(join(dirname(executable), 'cstrike', 'models'))
  const resolvedPath = resolve(modelsDirectory, relativePath)
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
