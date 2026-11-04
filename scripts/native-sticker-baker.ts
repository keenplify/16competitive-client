// Embedded in QuickJS: no filesystem, network, Node or Electron capabilities.
import { parseStickerRecipes } from '../src/shared/sticker-recipes'
import { STOCK_STICKER_MODELS } from '../src/shared/stock-sticker-models'
import {
  bakeProjectedStickers,
  fullColorStickerTextures,
  prepareStickerAtlas,
  validateStudioNormalLayout,
  validateStudioTextureLayout
} from '../src/renderer/src/libs/web-hlmv/lib/sticker-atlas'

// The atlas exporter uses TextEncoder only for ASCII texture names.
declare const nativeDecodeUtf8: (bytes: ArrayBuffer) => string
Object.assign(globalThis, {
  TextDecoder: class {
    decode(bytes: Uint8Array): string {
      return nativeDecodeUtf8(bytes.slice().buffer)
    }
  },
  TextEncoder: class {
    encode(value: string): Uint8Array {
      if (Array.from(value).some((character) => character.charCodeAt(0) > 127))
        throw new Error('Non-ASCII texture name')
      return Uint8Array.from(value, (c) => c.charCodeAt(0))
    }
  }
})

export function recipes(json: string): string {
  return JSON.stringify(
    parseStickerRecipes(JSON.parse(json)).map((recipe) => {
      const { id, ...content } = recipe
      void id
      return { ...recipe, canonical: JSON.stringify(content) }
    })
  )
}

export function bake(
  json: string,
  source: ArrayBuffer,
  images: { width: number; height: number; rgba: ArrayBuffer }[]
): { model: ArrayBuffer; textures: ArrayBuffer } {
  const [recipe] = parseStickerRecipes({ recipes: [JSON.parse(json)] })
  if (source.byteLength > 16 * 1024 * 1024 || images.length !== recipe.stickers.length)
    throw new Error('Invalid sticker inputs')
  const placements = recipe.stickers.map((item, i) => {
    const image = images[i]
    if (
      image.width < 1 ||
      image.height < 1 ||
      image.width > 512 ||
      image.height > 512 ||
      image.rgba.byteLength !== image.width * image.height * 4
    )
      throw new Error('Invalid sticker image')
    return { projection: item.projection, sticker: { ...image, rgba: new Uint8Array(image.rgba) } }
  })
  const atlas = prepareStickerAtlas(
    new Uint8Array(source),
    !Object.values(STOCK_STICKER_MODELS).some((entry) => entry.sha256 === recipe.sourceSha256)
  )
  const model = bakeProjectedStickers(atlas, placements)
  const textures = fullColorStickerTextures(atlas, placements)
  const bytes = new Uint8Array(12 + textures.reduce((sum, t) => sum + 12 + t.rgba.length, 0))
  bytes.set([49, 54, 67, 82, 71, 66, 65, 49])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, textures.length, true)
  let offset = 12
  for (const texture of textures) {
    view.setUint32(offset, texture.texture, true)
    view.setUint32(offset + 4, texture.width, true)
    view.setUint32(offset + 8, texture.height, true)
    bytes.set(texture.rgba, offset + 12)
    offset += 12 + texture.rgba.length
  }
  validateStudioNormalLayout(model)
  validateStudioTextureLayout(model)
  return { model: model.slice().buffer, textures: bytes.buffer }
}
