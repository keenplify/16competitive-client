import { parentPort, workerData } from 'node:worker_threads'
import { bakeStickerRecipe } from './sticker-bake'
import type { StickerRecipe } from '../../shared/sticker-recipes'
import type { StickerPixels } from '../../shared/sticker-model'
const input = workerData as {
  recipe: StickerRecipe
  source: Uint8Array
  images: { path: string; bytes: Uint8Array; pixels: StickerPixels }[]
}
void bakeStickerRecipe(
  input.recipe,
  input.source,
  async (path) => {
    const image = input.images.find((i) => i.path === path)
    if (!image) throw new Error('STICKER_IMAGE_INVALID')
    return image.bytes
  },
  async (bytes) => {
    const image = input.images.find((i) => i.bytes === bytes)
    if (!image) throw new Error('STICKER_IMAGE_INVALID')
    return image.pixels
  }
)
  .then((artifact) => parentPort!.postMessage(artifact))
  .catch((error) => {
    throw error
  })
