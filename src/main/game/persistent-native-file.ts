import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises'

export const nativeFileHash = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

export async function readNativeFile(path: string): Promise<Buffer> {
  const entry = await lstat(path)
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 128 * 1024 * 1024)
    throw new Error('Invalid managed native file')
  const bytes = await readFile(path)
  if (bytes.length > 128 * 1024 * 1024) throw new Error('Native file grew during verification')
  return bytes
}

export async function verifyPersistentNativeFile(
  path: string,
  installedHash: string,
  replacement: Uint8Array
): Promise<void> {
  const current = nativeFileHash(await readNativeFile(path))
  if (current !== installedHash && current !== nativeFileHash(replacement))
    throw new Error('Native file changed outside the launcher; preserve it for inspection')
}

export async function replacePersistentNativeFile(
  path: string,
  installedHash: string,
  replacement: Uint8Array
): Promise<void> {
  await verifyPersistentNativeFile(path, installedHash, replacement)
  await replaceNativeMetadata(path, replacement)
}

export async function replaceNativeMetadata(path: string, bytes: Uint8Array): Promise<void> {
  const before = nativeFileHash(await readNativeFile(path))
  const pending = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(pending, bytes, { flag: 'wx', mode: 0o600 })
    if (nativeFileHash(await readNativeFile(path)) !== before)
      throw new Error('Native file changed during update')
    await rename(pending, path)
  } finally {
    await rm(pending, { force: true })
  }
}
