import { cachedStickerImage } from './sticker-image-cache'
import { sharedModelDirectory } from './shared-skin-storage'
import { toWinePath } from './goldsrc-client-capabilities'
import { app, nativeImage } from 'electron'
import { Worker } from 'node:worker_threads'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, realpath, writeFile, rename, link, rm } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { parseStickerRecipes, type StickerRecipe } from '../../shared/sticker-recipes'
import type { StickerArtifact } from './sticker-bake'
import type { StickerPixels } from '../../shared/sticker-model'

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
async function boundedResponse(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok || Number(response.headers.get('content-length')) > limit || !response.body)
    throw new Error('Sticker download failed')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.length
      if (size > limit) throw new Error('Sticker download exceeds limit')
      chunks.push(result.value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}
async function boundedFile(file: string, limit: number): Promise<Uint8Array> {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit)
    throw new Error('Invalid sticker file')
  const handle = await open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid sticker file')
    const bytes = Buffer.alloc(stat.size)
    let at = 0
    while (at < bytes.length) {
      const { bytesRead } = await handle.read(bytes, at, bytes.length - at, at)
      if (!bytesRead) throw new Error('Short sticker file')
      at += bytesRead
    }
    return bytes
  } finally {
    await handle.close()
  }
}
function pixels(bytes: Uint8Array): StickerPixels {
  const png = Buffer.from(bytes)
  if (
    png.length < 24 ||
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    png.readUInt32BE(16) < 1 ||
    png.readUInt32BE(20) < 1 ||
    png.readUInt32BE(16) > 512 ||
    png.readUInt32BE(20) > 512
  )
    throw new Error('Invalid sticker PNG')
  const image = nativeImage.createFromBuffer(png)
  const { width, height } = image.getSize()
  if (image.isEmpty() || width < 1 || height < 1 || width > 512 || height > 512)
    throw new Error('Invalid sticker image')
  const bitmap = image.toBitmap()
  const rgba = new Uint8Array(bitmap.length)
  for (let i = 0; i < bitmap.length; i += 4) {
    rgba[i] = bitmap[i + 2]
    rgba[i + 1] = bitmap[i + 1]
    rgba[i + 2] = bitmap[i]
    rgba[i + 3] = bitmap[i + 3]
  }
  return { width, height, rgba }
}
async function bake(
  recipe: StickerRecipe,
  source: Uint8Array,
  images: { path: string; bytes: Uint8Array; pixels: StickerPixels }[]
): Promise<StickerArtifact> {
  const worker = new Worker(join(app.getAppPath(), 'out/main/sticker-bake-worker.js'), {
    workerData: { recipe, source, images }
  })
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Sticker bake timed out')), 30000)
      const done = (): void => {
        clearTimeout(timeout)
      }
      worker.once('message', (value) => {
        done()
        resolve(value as StickerArtifact)
      })
      worker.once('error', (error) => {
        done()
        reject(error)
      })
      worker.once('exit', (code) => {
        done()
        reject(new Error(`Sticker worker exited (${code})`))
      })
    })
  } finally {
    await worker.terminate()
  }
}

/** Immutable cosmetic cache, with a session-scoped authorization manifest. */
export async function stageMatchStickers(options: {
  matchId: string
  apiUrl: string
  token: string
  gameRoot: string
  session: string
  wine?: boolean
}): Promise<void> {
  const { matchId, apiUrl, token, gameRoot, session } = options
  const request = await fetch(new URL(`/matches/${matchId}/stickers`, apiUrl), {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  })
  if (request.status === 404) return // Older backend: ordinary models remain available.
  const recipes = parseStickerRecipes(
    JSON.parse(Buffer.from(await boundedResponse(request, 128 * 1024)).toString('utf8'))
  )
  if (!recipes.length) return
  const root = await realpath(join(gameRoot, 'cstrike'))
  if (/[\r\n\t]/.test(root)) throw new Error('Invalid game root')
  let directory = root
  for (const part of ['models', '16competitive', 'st']) {
    directory = join(directory, part)
    await mkdir(directory, { recursive: false }).catch((error) => {
      if (error.code !== 'EEXIST') throw error
    })
    const info = await lstat(directory)
    const resolved = await realpath(directory)
    if (part === '16competitive' && info.isSymbolicLink()) {
      // Accept only the launcher-owned shared model link, never arbitrary redirects.
      if (resolved !== (await realpath(sharedModelDirectory())))
        throw new Error('Invalid sticker cache directory')
      directory = resolved
    } else if (!info.isDirectory() || info.isSymbolicLink() || resolved !== directory) {
      throw new Error('Invalid sticker cache directory')
    }
  }
  const imageCache = new Map<string, { path: string; bytes: Uint8Array; pixels: StickerPixels }>()
  const rows: string[] = []
  const textureRows: string[] = []
  const deadline = Date.now() + 60000
  for (const recipe of recipes) {
    if (Date.now() >= deadline) break
    try {
      const sourcePath = await realpath(join(root, recipe.sourcePath))
      const sourceRelative = relative(root, sourcePath)
      if (sourceRelative.startsWith('..') || isAbsolute(sourceRelative))
        throw new Error('Invalid sticker source path')
      const source = await boundedFile(sourcePath, 16 * 1024 * 1024)
      const images: { path: string; bytes: Uint8Array; pixels: StickerPixels }[] = []
      for (const item of recipe.stickers) {
        let image = imageCache.get(item.imagePath)
        if (!image) {
          const bytes = await cachedStickerImage(item.imagePath, apiUrl)
          image = { path: item.imagePath, bytes, pixels: pixels(bytes) }
          imageCache.set(item.imagePath, image)
        }
        images.push(image)
      }
      const artifact = await bake(recipe, source, images)
      const output = join(directory, `${artifact.sha256.slice(0, 32)}.mdl`)
      const temporary = join(directory, `.${randomUUID()}.tmp`)
      try {
        await writeFile(temporary, artifact.bytes, { flag: 'wx', mode: 0o600 })
        await link(temporary, output).catch((error) => {
          if (error.code !== 'EEXIST') throw error
        })
        if (hash(await boundedFile(output, 16 * 1024 * 1024)) !== artifact.sha256)
          throw new Error('Sticker cache hash mismatch')
      } finally {
        await rm(temporary, { force: true })
      }
      // Optional sidecar: older approved helpers continue using the palette model.
      const textureOutput = join(directory, `${artifact.textureSha256.slice(0, 32)}.rgba`)
      const textureTemporary = join(directory, `.${randomUUID()}.tmp`)
      try {
        await writeFile(textureTemporary, artifact.textureBytes, { flag: 'wx', mode: 0o600 })
        await link(textureTemporary, textureOutput).catch((error) => {
          if (error.code !== 'EEXIST') throw error
        })
        if (hash(await boundedFile(textureOutput, 32 * 1024 * 1024)) !== artifact.textureSha256)
          throw new Error('Sticker texture cache hash mismatch')
        textureRows.push(`${recipe.id}\t${artifact.sha256}\t${artifact.textureSha256}`)
      } catch (error) {
        console.warn('[Stickers] full-color texture unavailable; using palette model', error)
      } finally {
        await rm(textureTemporary, { force: true })
      }
      rows.push(`${recipe.id}\t${artifact.sha256}\t${recipe.sourcePath}`)
    } catch (error) {
      console.warn('[Stickers] recipe unavailable; using ordinary model', {
        recipeId: recipe.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  if (!rows.length) return
  await writeFile(
    join(session, 'stickers.tsv.tmp'),
    `16c-stickers-v1\n${options.wine ? toWinePath(root) : root}\n${rows.join('\n')}\n`,
    { mode: 0o600 }
  )
  await rename(join(session, 'stickers.tsv.tmp'), join(session, 'stickers.tsv'))
  if (textureRows.length) {
    await writeFile(
      join(session, 'sticker-textures.tsv.tmp'),
      `16c-sticker-textures-v1\n${textureRows.join('\n')}\n`,
      { mode: 0o600 }
    )
    await rename(join(session, 'sticker-textures.tsv.tmp'), join(session, 'sticker-textures.tsv'))
  }
}
