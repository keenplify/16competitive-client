import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseStickerRecipes, type StickerRecipe } from '../../shared/sticker-recipes'
import { STICKER_TEXTURE_BYTE_LIMIT, STICKER_CACHE_REVISION } from '../../shared/sticker-rendering'
import type { StickerArtifact } from './sticker-bake'

export { STICKER_CACHE_REVISION } from '../../shared/sticker-rendering'
type Saved = { sha256: string; textureSha256: string }
const pending = new Map<string, Promise<Saved>>()
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
async function read(file: string, limit: number): Promise<Uint8Array> {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit)
    throw new Error('Invalid sticker cache file')
  const handle = await open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid sticker cache file')
    const bytes = new Uint8Array(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) throw new Error('Truncated sticker cache file')
      offset += bytesRead
    }
    return bytes
  } finally {
    await handle.close()
  }
}
async function atomic(file: string, bytes: Uint8Array | string): Promise<void> {
  const temp = join(dirname(file), `.${randomUUID()}.tmp`)
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 })
    await rename(temp, file)
  } finally {
    await rm(temp, { force: true })
  }
}

/** Persist only derived pixels. Every call still requires a fresh server recipe and verified source. */
export async function cachedStickerArtifact(
  directory: string,
  input: StickerRecipe,
  source: Uint8Array,
  produce: () => Promise<StickerArtifact>
): Promise<Saved> {
  const [recipe] = parseStickerRecipes({ recipes: [input] })
  const { id, ...content } = recipe
  if (
    source.length > 16 * 1024 * 1024 ||
    hash(Buffer.from(JSON.stringify(content))).slice(0, 32) !== id ||
    hash(source) !== recipe.sourceSha256
  )
    throw new Error('STICKER_RECIPE_INVALID')
  const index = join(directory, `recipe-${id}-${STICKER_CACHE_REVISION}.json`)
  const existing = pending.get(index)
  if (existing) return existing
  const task = (async (): Promise<Saved> => {
    await mkdir(directory, { recursive: true })
    try {
      const record = JSON.parse(Buffer.from(await read(index, 2048)).toString('utf8')) as Saved & {
        revision: string
        recipeId: string
      }
      if (
        record.revision !== STICKER_CACHE_REVISION ||
        record.recipeId !== id ||
        !/^[a-f0-9]{64}$/.test(record.sha256) ||
        !/^[a-f0-9]{64}$/.test(record.textureSha256)
      )
        throw new Error('Stale sticker cache')
      const model = await read(
        join(directory, record.sha256.slice(0, 32) + '.mdl'),
        16 * 1024 * 1024
      )
      const texture = await read(
        join(directory, record.textureSha256.slice(0, 32) + '.rgba'),
        STICKER_TEXTURE_BYTE_LIMIT
      )
      if (hash(model) !== record.sha256 || hash(texture) !== record.textureSha256)
        throw new Error('Changed sticker cache')
      return { sha256: record.sha256, textureSha256: record.textureSha256 }
    } catch (error) {
      if (!(error instanceof Error)) throw error
      if (!('code' in error) || error.code !== 'ENOENT')
        console.info('[Stickers] rebuilding unverified local cache', {
          recipeId: id,
          reason: error.message
        })
    }
    const artifact = await produce()
    if (
      artifact.recipeId !== id ||
      artifact.bytes.length > 16 * 1024 * 1024 ||
      artifact.textureBytes.length > STICKER_TEXTURE_BYTE_LIMIT ||
      hash(artifact.bytes) !== artifact.sha256 ||
      hash(artifact.textureBytes) !== artifact.textureSha256
    )
      throw new Error('Invalid sticker artifact')
    await atomic(join(directory, artifact.sha256.slice(0, 32) + '.mdl'), artifact.bytes)
    await atomic(
      join(directory, artifact.textureSha256.slice(0, 32) + '.rgba'),
      artifact.textureBytes
    )
    const saved = { sha256: artifact.sha256, textureSha256: artifact.textureSha256 }
    await atomic(
      index,
      JSON.stringify({ revision: STICKER_CACHE_REVISION, recipeId: id, ...saved })
    )
    return saved
  })()
  pending.set(index, task)
  try {
    return await task
  } finally {
    pending.delete(index)
  }
}
