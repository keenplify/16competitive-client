import { app } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000
const CACHE_MAX_BYTES = 256 * 1024 * 1024
const MODEL_MAX_BYTES = 32 * 1024 * 1024
const MODEL_MAGIC = 'IDST'
const SHA256_PATTERN = /^[a-f0-9]{64}$/

interface CacheMetadata {
  cachedAt: number
  size: number
  sha256: string
}

const cacheDirectory = (): string => join(app.getPath('userData'), 'cache', 'skin-models')

const cachePaths = (skinId: string): { model: string; metadata: string } => {
  const directory = cacheDirectory()
  return {
    model: join(directory, `${skinId}.mdl`),
    metadata: join(directory, `${skinId}.json`)
  }
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const isModel = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= 16 &&
  bytes.byteLength <= MODEL_MAX_BYTES &&
  Buffer.from(bytes.buffer, bytes.byteOffset, 4).toString() === MODEL_MAGIC

const toArrayBuffer = (bytes: Buffer): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const readMetadata = async (path: string): Promise<CacheMetadata | null> => {
  const raw = await readFile(path, 'utf8').catch(() => null)
  if (!raw) return null
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null) return null
  const metadata = value as Record<string, unknown>
  if (
    typeof metadata.cachedAt !== 'number' ||
    typeof metadata.size !== 'number' ||
    typeof metadata.sha256 !== 'string' ||
    !SHA256_PATTERN.test(metadata.sha256)
  ) {
    return null
  }
  return metadata as unknown as CacheMetadata
}

const removeEntry = async (skinId: string): Promise<void> => {
  const paths = cachePaths(skinId)
  await Promise.all([
    unlink(paths.model).catch(() => undefined),
    unlink(paths.metadata).catch(() => undefined)
  ])
}

export const readCachedSkinPreview = async (skinId: string): Promise<ArrayBuffer | null> => {
  const paths = cachePaths(skinId)
  try {
    const metadata = await readMetadata(paths.metadata)
    if (!metadata || Date.now() - metadata.cachedAt > CACHE_MAX_AGE_MS) {
      await removeEntry(skinId)
      return null
    }

    const bytes = await readFile(paths.model)
    if (
      !isModel(bytes) ||
      bytes.byteLength !== metadata.size ||
      sha256(bytes) !== metadata.sha256
    ) {
      await removeEntry(skinId)
      return null
    }
    return toArrayBuffer(bytes)
  } catch {
    await removeEntry(skinId)
    return null
  }
}

const pruneCache = async (): Promise<void> => {
  const directory = cacheDirectory()
  const names = await readdir(directory).catch(() => [])
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith('.mdl'))
      .map(async (name) => {
        const metadata = await stat(join(directory, name)).catch(() => null)
        return metadata?.isFile()
          ? { name, size: metadata.size, modifiedAt: metadata.mtimeMs }
          : null
      })
  )
  const models = entries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => left.modifiedAt - right.modifiedAt)
  let totalBytes = models.reduce((total, entry) => total + entry.size, 0)

  for (const model of models) {
    if (totalBytes <= CACHE_MAX_BYTES) break
    const skinId = model.name.slice(0, -'.mdl'.length)
    await removeEntry(skinId)
    totalBytes -= model.size
  }
}

export const writeCachedSkinPreview = async (
  skinId: string,
  modelBuffer: ArrayBuffer
): Promise<void> => {
  const bytes = Buffer.from(modelBuffer)
  if (!isModel(bytes)) throw new Error('Refusing to cache an invalid skin preview model.')

  const directory = cacheDirectory()
  const paths = cachePaths(skinId)
  const suffix = randomUUID()
  const temporaryModel = `${paths.model}.${suffix}.partial`
  const temporaryMetadata = `${paths.metadata}.${suffix}.partial`
  const metadata: CacheMetadata = {
    cachedAt: Date.now(),
    size: bytes.byteLength,
    sha256: sha256(bytes)
  }

  await mkdir(directory, { recursive: true, mode: 0o700 })
  try {
    await writeFile(temporaryModel, bytes, { mode: 0o600 })
    await writeFile(temporaryMetadata, JSON.stringify(metadata), { mode: 0o600 })
    await rename(temporaryModel, paths.model)
    await rename(temporaryMetadata, paths.metadata)
  } finally {
    await Promise.all([
      unlink(temporaryModel).catch(() => undefined),
      unlink(temporaryMetadata).catch(() => undefined)
    ])
  }

  await pruneCache()
}
