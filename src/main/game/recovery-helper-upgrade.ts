import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises'

export interface RecoveryDescriptor {
  helperPath: string
  helperSha256: string
  sessionId: string
}

/** Adopt only the current launcher's verified helper, never a path from the journal.
 * Preserve the session ID and all restoration journals so native recovery still
 * verifies the original and installed DLLs under its existing Windows mutex. */
export async function upgradeRecoveryHelper(
  path: string,
  previousContents: string,
  descriptor: RecoveryDescriptor,
  currentHelperPath: string,
  verify: (path: string) => Promise<void>
): Promise<RecoveryDescriptor> {
  await verify(currentHelperPath)
  const helperSha256 = createHash('sha256')
    .update(await readFile(currentHelperPath))
    .digest('hex')
  if (descriptor.helperPath === currentHelperPath && descriptor.helperSha256 === helperSha256)
    return descriptor

  const updated = { ...descriptor, helperPath: currentHelperPath, helperSha256 }
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(updated), { flag: 'wx', mode: 0o600 })
    const entry = await lstat(path)
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.size > 4096 ||
      (await readFile(path, 'utf8')) !== previousContents
    )
      throw new Error('Cosmetic recovery session changed during helper upgrade')
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
  return updated
}
