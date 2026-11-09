import { ALL_STOCK_STICKER_MODELS } from '../../shared/stock-sticker-models'
import { createHash } from 'node:crypto'
import type { StickerPixels } from '../../shared/sticker-model'
import { parseStickerRecipes, type StickerRecipe } from '../../shared/sticker-recipes'
import {
  STICKER_TEXTURE_SCALE,
  bakeProjectedStickers,
  fullColorStickerTextures,
  prepareStickerAtlas,
  validateStudioNormalLayout,
  validateStudioTextureLayout
} from '../../renderer/src/libs/web-hlmv/lib/sticker-atlas'

export type StickerArtifact = {
  recipeId: string
  sourcePath: string
  sha256: string
  bytes: Uint8Array
  textureBytes: Uint8Array
  textureSha256: string
}

/** Bake only a bounded, hash-verified source and immutable artwork. No filesystem writes. */
export async function bakeStickerRecipe(
  input: StickerRecipe,
  source: Uint8Array,
  readImage: (path: string) => Promise<Uint8Array>,
  decodeImage: (bytes: Uint8Array) => Promise<StickerPixels>
): Promise<StickerArtifact> {
  const [recipe] = parseStickerRecipes({ recipes: [input] })
  const { id, ...content } = recipe
  // Server and client hash the same canonical content, including exporter version.
  if (createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32) !== id)
    throw new Error('STICKER_RECIPE_INVALID')
  if (
    source.length > 16 * 1024 * 1024 ||
    createHash('sha256').update(source).digest('hex') !== recipe.sourceSha256
  )
    throw new Error('STICKER_MODEL_UNSUPPORTED')
  const placements: {
    sticker: StickerPixels
    projection: StickerRecipe['stickers'][number]['projection']
  }[] = []
  for (const item of recipe.stickers) {
    const bytes = await readImage(item.imagePath)
    if (
      bytes.length > 2000000 ||
      createHash('sha256').update(bytes).digest('hex') !== item.imagePath.split('/')[3]
    )
      throw new Error('STICKER_IMAGE_INVALID')
    placements.push({ sticker: await decodeImage(bytes), projection: item.projection })
  }
  const atlas = prepareStickerAtlas(
    source,
    !ALL_STOCK_STICKER_MODELS.some((entry) => entry.sha256 === recipe.sourceSha256)
  )
  const bytes = bakeProjectedStickers(atlas, placements)
  const textures = fullColorStickerTextures(atlas, placements, STICKER_TEXTURE_SCALE)
  const textureBytes = new Uint8Array(12 + textures.reduce((sum, t) => sum + 12 + t.rgba.length, 0))
  textureBytes.set(new TextEncoder().encode('16CRGBA1'))
  const view = new DataView(textureBytes.buffer)
  view.setUint32(8, textures.length, true)
  let offset = 12
  for (const texture of textures) {
    view.setUint32(offset, texture.texture, true)
    view.setUint32(offset + 4, texture.width, true)
    view.setUint32(offset + 8, texture.height, true)
    textureBytes.set(texture.rgba, offset + 12)
    offset += 12 + texture.rgba.length
  }
  validateStudioNormalLayout(bytes)
  validateStudioTextureLayout(bytes)
  return {
    recipeId: id,
    sourcePath: recipe.sourcePath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
    textureBytes,
    textureSha256: createHash('sha256').update(textureBytes).digest('hex')
  }
}
