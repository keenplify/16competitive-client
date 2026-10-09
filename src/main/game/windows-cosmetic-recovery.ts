import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const missingOnly = (error: unknown): null => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
  throw error
}
type Journal = { originalSha256: string; moduleSha256: string; ownsBackup: boolean }

export async function recoverWindowsCosmeticInstallation(gameRoot: string): Promise<void> {
  const clientPath = join(gameRoot, 'cstrike', 'cl_dlls', 'client.dll')
  const originalPath = join(gameRoot, 'client_original.dll')
  const journalPath = join(gameRoot, '16competitive', 'cosmetic-install.json')
  const sessionDirectory = join(gameRoot, '16competitive', 'live-session')
  const journalBytes = await readFile(journalPath).catch(missingOnly)
  if (!journalBytes) return
  if (journalBytes.length > 256) throw new Error('Invalid cosmetic installation journal')
  const journal = JSON.parse(journalBytes.toString('utf8')) as Partial<Journal>
  if (
    !journal ||
    !journal.originalSha256 ||
    !journal.moduleSha256 ||
    typeof journal.ownsBackup !== 'boolean' ||
    !/^[a-f0-9]{64}$/.test(journal.originalSha256) ||
    !/^[a-f0-9]{64}$/.test(journal.moduleSha256)
  )
    throw new Error('Invalid cosmetic installation journal')
  const current = await readFile(clientPath)
  const currentHash = hash(current)
  if (currentHash !== journal.moduleSha256 && currentHash !== journal.originalSha256) {
    // A game update or a different distribution replaced the proxy. Never
    // overwrite that client with an older backup, or treat its hash as a ban.
    const archive = await mkdtemp(join(gameRoot, '16competitive', 'cosmetic-recovery-'))
    const original = await lstat(originalPath).catch(missingOnly)
    if (journal.ownsBackup && original)
      await rename(originalPath, join(archive, 'client_original.dll'))
    await rename(journalPath, join(archive, 'cosmetic-install.json'))
    console.info(
      '[Scoreboard] Preserved changed game client and archived stale cosmetic recovery',
      {
        archive,
        currentSha256: currentHash
      }
    )
    return
  }
  // Only our still-installed proxy needs a verified original restored.
  const original = await readFile(originalPath).catch(missingOnly)
  const originalMatches = original !== null && hash(original) === journal.originalSha256
  if (currentHash === journal.moduleSha256) {
    if (!originalMatches)
      throw new Error('Original Counter-Strike client backup is unavailable or changed')
    await copyFile(originalPath, clientPath)
  }
  await rm(sessionDirectory, { recursive: true, force: true })
  await rm(`${clientPath}.16competitive.tmp`, { force: true })
  if (journal.ownsBackup && originalMatches) await rm(originalPath)
  await rm(journalPath)
}
