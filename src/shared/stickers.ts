import { parseGameVersion, type GameVersion } from './game-version'
import { stockStickerModel } from './stock-sticker-models'
export type StickerProjection = {
  center: [number, number, number]
  right: [number, number, number]
  up: [number, number, number]
  normal: [number, number, number]
  size: number
  angle: number
}
export type StickerCatalogItem = {
  id: string
  name: string
  enabled: boolean
  pricePoints: number | null
  pricePCash: number | null
  imagePath: string | null
}
export type OwnedSticker = {
  id: string
  stickerId: string
  name: string
  imagePath: string
  gameVersion: GameVersion
  weaponKey: string | null
  projection: StickerProjection | null
  appliedAt: string | null
  acquiredAt: string
}
export type StickerSnapshot = { catalog: StickerCatalogItem[]; items: OwnedSticker[] }
export type StickerBuy = { requestId: string; currency: 'POINTS' | 'P_CASH'; expectedPrice: number }
export const STICKER_CHANNELS = {
  snapshot: 'inventory:stickers',
  buy: 'inventory:sticker-buy',
  apply: 'inventory:sticker-apply',
  remove: 'inventory:sticker-remove',
  image: 'inventory:sticker-image'
} as const
export const stickerId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(value))
    throw new Error('STICKER_INVALID')
  return value
}
export const stickerUuid = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
  )
    throw new Error('STICKER_INVALID')
  return value
}
export function validateStickerBuy(value: unknown): StickerBuy {
  if (!value || typeof value !== 'object') throw new Error('STICKER_INVALID')
  const v = value as StickerBuy
  stickerUuid(v.requestId)
  if (
    !['POINTS', 'P_CASH'].includes(v.currency) ||
    !Number.isSafeInteger(v.expectedPrice) ||
    v.expectedPrice < 0 ||
    v.expectedPrice > 1000000
  )
    throw new Error('STICKER_INVALID')
  return { requestId: v.requestId, currency: v.currency, expectedPrice: v.expectedPrice }
}
const imagePattern = /^media\/16competitive\/stickers\/[a-f0-9]{64}\/image\.png$/
export function stickerImagePath(value: unknown): string {
  if (typeof value !== 'string' || !imagePattern.test(value))
    throw new Error('STICKER_IMAGE_INVALID')
  return value
}
export function parseStickerSnapshot(value: unknown): StickerSnapshot {
  if (!value || typeof value !== 'object') throw new Error('STICKER_RESPONSE_INVALID')
  const s = value as StickerSnapshot
  if (
    !Array.isArray(s.catalog) ||
    !Array.isArray(s.items) ||
    s.catalog.length > 10000 ||
    s.items.length > 10000
  )
    throw new Error('STICKER_RESPONSE_INVALID')
  for (const c of s.catalog) {
    if (!c || typeof c !== 'object') throw new Error('STICKER_RESPONSE_INVALID')
    stickerId(c.id)
    if (
      typeof c.name !== 'string' ||
      c.name.length > 128 ||
      typeof c.enabled !== 'boolean' ||
      [c.pricePoints, c.pricePCash].some(
        (p) => p !== null && (!Number.isSafeInteger(p) || p < 0 || p > 1000000)
      )
    )
      throw new Error('STICKER_RESPONSE_INVALID')
    if (c.imagePath !== null) stickerImagePath(c.imagePath)
  }
  for (const i of s.items) {
    if (!i || typeof i !== 'object') throw new Error('STICKER_RESPONSE_INVALID')
    i.gameVersion = parseGameVersion(i.gameVersion)
    stickerUuid(i.id)
    stickerId(i.stickerId)
    stickerImagePath(i.imagePath)
    if (
      typeof i.name !== 'string' ||
      i.name.length > 128 ||
      typeof i.acquiredAt !== 'string' ||
      (i.weaponKey !== null &&
        !(i.weaponKey.startsWith('stock:')
          ? stockStickerModel(i.weaponKey.slice(6), i.gameVersion)
          : /^skin:[a-f0-9-]{36}$/.test(i.weaponKey))) ||
      (i.appliedAt !== null && typeof i.appliedAt !== 'string')
    )
      throw new Error('STICKER_RESPONSE_INVALID')
  }
  for (const i of s.items) {
    if (!Number.isFinite(Date.parse(i.acquiredAt))) throw new Error('STICKER_RESPONSE_INVALID')
    const applied = i.appliedAt !== null
    if (applied !== (i.weaponKey !== null) || applied !== (i.projection !== null))
      throw new Error('STICKER_RESPONSE_INVALID')
    if (applied) {
      if (!Number.isFinite(Date.parse(i.appliedAt!))) throw new Error('STICKER_RESPONSE_INVALID')
      i.projection = parseStickerProjection(i.projection)
    }
  }
  if (
    new Set(s.items.map((i) => i.id)).size !== s.items.length ||
    new Set(s.catalog.map((i) => i.id)).size !== s.catalog.length
  )
    throw new Error('STICKER_RESPONSE_INVALID')
  return s
}

/** Canonical, bounded placement data accepted from the API and IPC. */
export function parseStickerProjection(value: unknown): StickerProjection {
  if (!value || typeof value !== 'object') throw new Error('STICKER_POSITION_INVALID')
  const p = value as StickerProjection
  for (const v of [p.center, p.right, p.up, p.normal]) {
    if (
      !Array.isArray(v) ||
      v.length !== 3 ||
      !v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 4096)
    )
      throw new Error('STICKER_POSITION_INVALID')
  }
  const dot = (a: number[], b: number[]) => a.reduce((sum, n, i) => sum + n * b[i], 0)
  const axes = [p.right, p.up, p.normal]
  if (
    axes.some((v) => Math.abs(dot(v, v) - 1) > 0.02) ||
    Math.abs(dot(p.right, p.up)) > 0.02 ||
    Math.abs(dot(p.right, p.normal)) > 0.02 ||
    Math.abs(dot(p.up, p.normal)) > 0.02 ||
    typeof p.size !== 'number' ||
    !Number.isFinite(p.size) ||
    p.size < 0.02 ||
    p.size > 0.65 ||
    typeof p.angle !== 'number' ||
    !Number.isFinite(p.angle) ||
    Math.abs(p.angle) > 180
  )
    throw new Error('STICKER_POSITION_INVALID')
  return {
    center: [...p.center],
    right: [...p.right],
    up: [...p.up],
    normal: [...p.normal],
    size: p.size,
    angle: p.angle
  }
}

export function parseStickerPurchase(value: unknown): { id: string } {
  if (!value || typeof value !== 'object' || !('id' in value))
    throw new Error('STICKER_RESPONSE_INVALID')
  return { id: stickerUuid(value.id) }
}
