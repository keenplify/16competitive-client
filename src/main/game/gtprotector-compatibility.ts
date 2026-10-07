import { lstat, mkdir, mkdtemp, readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

const MODULE_NAMES = new Set(['gtlib.asi', 'gtprotector.asi'])

const ensureDirectory = async (path: string): Promise<void> => {
  await mkdir(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
  const entry = await lstat(path)
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error('GTProtector backup directory is not a regular directory')
  }
}

/**
 * Mirrors csldr v2.31's RemoveGTlib compatibility workaround, but preserves
 * each module instead of deleting it. Call only after the game has stopped.
 * Backups stay disabled across launches; restoring them re-enables GTProtector.
 */
export async function disableConflictingGtProtector(
  gameRoot: string,
  options: {
    platform: NodeJS.Platform
    distribution: 'steam' | 'standalone'
    nextClient: boolean
  }
): Promise<string[]> {
  if (options.platform !== 'win32' || options.distribution !== 'standalone' || options.nextClient) {
    return []
  }
  const root = await lstat(gameRoot)
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw new Error('GTProtector game directory is not a regular directory')
  }
  // Match actual names case-insensitively, including GTlib.asi as used upstream.
  const names = (await readdir(gameRoot)).filter((name) => MODULE_NAMES.has(name.toLowerCase()))
  if (names.length === 0) return []
  for (const name of names) {
    const entry = await lstat(join(gameRoot, name))
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error('GTProtector module is not a regular file')
    }
  }
  const managed = join(gameRoot, '16competitive')
  await ensureDirectory(managed)
  const backups = join(managed, 'disabled-gtprotector')
  await ensureDirectory(backups)
  // A separate directory per attempt preserves older backups after a repack
  // updater reinstalls the modules. A crash cannot leave an overwritten backup.
  const destination = await mkdtemp(join(backups, 'backup-'))
  const moved: string[] = []
  for (const name of names) {
    const backup = join(destination, `${name}.disabled`)
    await rename(join(gameRoot, name), backup)
    moved.push(backup)
    console.info('[GameLaunch] conflicting GTProtector module backed up and disabled', {
      module: name,
      backup,
      reason: 'Find Cl/En/St modules startup incompatibility'
    })
  }
  return moved
}
