import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { stickerImagePath } from '../../shared/stickers'
import { sharedModelDirectory } from './shared-skin-storage'
import { managedAssetDestination } from './shared-model-directory'

const MAX_BYTES = 2_000_000
const pending = new Map<string, Promise<Uint8Array>>()

function valid(bytes: Uint8Array, expected: string): boolean {
  const png = Buffer.from(bytes)
  return (
    png.length >= 24 &&
    png.length <= MAX_BYTES &&
    png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    png.readUInt32BE(16) > 0 &&
    png.readUInt32BE(16) <= 512 &&
    png.readUInt32BE(20) > 0 &&
    png.readUInt32BE(20) <= 512 &&
    createHash('sha256').update(png).digest('hex') === expected
  )
}

async function load(key: string, apiUrl: string): Promise<Uint8Array> {
  const expected = key.split('/')[3]
  const root = join(dirname(dirname(sharedModelDirectory())), 'sticker-images')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid sticker cache')
  const destination = await managedAssetDestination(root, `${expected}.png`)
  const metadata = await lstat(destination).catch(() => null)
  if (metadata?.isFile() && metadata.size <= MAX_BYTES) {
    const cached = await readFile(destination)
    if (valid(cached, expected)) return cached
  }
  const response = await fetch(new URL(`/fastdl/${key}`, apiUrl), {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body)
    throw new Error('Sticker download failed')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.length
      if (size > MAX_BYTES) throw new Error('Sticker download exceeds limit')
      chunks.push(item.value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks)
  if (!valid(bytes, expected)) throw new Error('Sticker artwork hash or image is invalid')
  const temporary = `${destination}.${randomUUID()}.partial`
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
  return bytes
}

/** Shared by early preparation, previews and match delivery. Never grants ownership. */
export function cachedStickerImage(path: unknown, apiUrl: string): Promise<Uint8Array> {
  const key = stickerImagePath(path)
  const existing = pending.get(key)
  if (existing) return existing
  const task = load(key, apiUrl).finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}
