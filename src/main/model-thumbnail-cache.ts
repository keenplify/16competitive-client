import { app } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_ENTRY_BYTES = 2 * 1024 * 1024
const MAX_CACHE_BYTES = 128 * 1024 * 1024
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const validateKey = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 500 || value.includes('\0')) {
    throw new Error('Invalid model thumbnail cache key.')
  }
  return value
}

const directory = (): string => join(app.getPath('userData'), 'cache', 'model-thumbnails')
const filePath = (key: string): string =>
  join(directory(), `${createHash('sha256').update(key).digest('hex')}.png`)
const isPng = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= PNG_SIGNATURE.byteLength &&
  bytes.byteLength <= MAX_ENTRY_BYTES &&
  Buffer.from(bytes.buffer, bytes.byteOffset, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
const toArrayBuffer = (bytes: Buffer): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const prune = async (): Promise<void> => {
  const root = directory()
  const names = await readdir(root).catch(() => [])
  const entries = (
    await Promise.all(
      names
        .filter((name) => name.endsWith('.png'))
        .map(async (name) => {
          const metadata = await stat(join(root, name)).catch(() => null)
          return metadata?.isFile()
            ? { name, size: metadata.size, modifiedAt: metadata.mtimeMs }
            : null
        })
    )
  )
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => left.modifiedAt - right.modifiedAt)
  let total = entries.reduce((sum, entry) => sum + entry.size, 0)
  for (const entry of entries) {
    if (total <= MAX_CACHE_BYTES) break
    await unlink(join(root, entry.name)).catch(() => undefined)
    total -= entry.size
  }
}

export const readModelThumbnail = async (untrustedKey: unknown): Promise<ArrayBuffer | null> => {
  const destination = filePath(validateKey(untrustedKey))
  const metadata = await stat(destination).catch(() => null)
  if (!metadata?.isFile() || Date.now() - metadata.mtimeMs > MAX_AGE_MS) {
    await unlink(destination).catch(() => undefined)
    return null
  }
  const bytes = await readFile(destination).catch(() => null)
  if (!bytes || !isPng(bytes)) {
    await unlink(destination).catch(() => undefined)
    return null
  }
  return toArrayBuffer(bytes)
}

export const writeModelThumbnail = async (
  untrustedKey: unknown,
  untrustedPng: unknown
): Promise<void> => {
  const key = validateKey(untrustedKey)
  if (!(untrustedPng instanceof ArrayBuffer)) throw new Error('Invalid model thumbnail data.')
  const bytes = Buffer.from(untrustedPng)
  if (!isPng(bytes)) throw new Error('Invalid model thumbnail PNG.')

  const root = directory()
  const destination = filePath(key)
  const temporary = `${destination}.${randomUUID()}.partial`
  await mkdir(root, { recursive: true, mode: 0o700 })
  try {
    await writeFile(temporary, bytes, { mode: 0o600 })
    await rename(temporary, destination)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
  await prune()
}
