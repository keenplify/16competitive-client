import { STOCK_STICKER_MODELS } from './stock-sticker-models'
import { parseStickerProjection, stickerImagePath, type StickerProjection } from './stickers'

export const STICKER_EXPORT_VERSION = 1
export const STOCK_AK_SHA256 = '6eb08a5e76210712ad787949e244fd57346b1836a7462f3a436976126e270fa3'
export type StickerRecipe = {
  version: 1
  id: string
  sourcePath: string
  sourceSha256: string
  stickers: { imagePath: string; projection: StickerProjection }[]
}

export function parseStickerRecipes(value: unknown): StickerRecipe[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !('recipes' in value) ||
    !Array.isArray(value.recipes) ||
    value.recipes.length > 32
  )
    throw new Error('STICKER_RESPONSE_INVALID')
  const recipes = value.recipes.map((value: unknown): StickerRecipe => {
    if (!value || typeof value !== 'object') throw new Error('STICKER_RESPONSE_INVALID')
    const recipe = value as StickerRecipe
    if (
      recipe.version !== STICKER_EXPORT_VERSION ||
      typeof recipe.id !== 'string' ||
      !/^[a-f0-9]{32}$/.test(recipe.id) ||
      !Object.values(STOCK_STICKER_MODELS).some(
        (entry) =>
          entry.sha256 === recipe.sourceSha256 &&
          (recipe.sourcePath === `models/v_${entry.model}.mdl` ||
            recipe.sourcePath.startsWith('models/16competitive/'))
      ) ||
      typeof recipe.sourcePath !== 'string' ||
      recipe.sourcePath.length >= 64 ||
      recipe.sourcePath.includes('..') ||
      !/^(models\/v_[a-z0-9]+\.mdl|models\/16competitive\/[a-zA-Z0-9_/-]+\.mdl)$/.test(
        recipe.sourcePath
      ) ||
      !Array.isArray(recipe.stickers) ||
      recipe.stickers.length < 1 ||
      recipe.stickers.length > 5
    )
      throw new Error('STICKER_RESPONSE_INVALID')
    return {
      version: 1,
      id: recipe.id,
      sourcePath: recipe.sourcePath,
      sourceSha256: recipe.sourceSha256,
      stickers: recipe.stickers.map((item) => {
        if (!item || typeof item !== 'object') throw new Error('STICKER_RESPONSE_INVALID')
        return {
          imagePath: stickerImagePath(item.imagePath),
          projection: parseStickerProjection(item.projection)
        }
      })
    }
  })
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length)
    throw new Error('STICKER_RESPONSE_INVALID')
  return recipes
}
