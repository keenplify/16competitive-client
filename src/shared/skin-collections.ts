import type { Skin, SkinCurrency } from './skins'

export interface SkinCollection {
  id: string
  name: string
  description: string
  imageUrl: string
  videoUrl: string | null
  published: boolean
  featured: boolean
  discountPercent: number
  skinIds: string[]
}
export interface CollectionDetail {
  collection: SkinCollection
  items: (Skin & { owned: boolean })[]
}
export interface CollectionQuote {
  collectionId: string
  currency: SkinCurrency
  subtotal: number
  total: number
  discountPercent: number
  items: { skinId: string; price: number }[]
  quoteHash: string
}
export interface CollectionPurchase {
  points: number
  pCash: number
  receipt: { requestKey: string; collectionId: string; currency: SkinCurrency; total: number }
}
export type CollectionBuyInput = Pick<CollectionQuote, 'currency' | 'quoteHash'> & {
  requestKey: string
}
const invalid = (): never => {
  throw new Error('COLLECTION_INVALID_RESPONSE')
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : invalid()
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
export function validateCollectionId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(value)) return invalid()
  return value
}
export function validateCollectionCurrency(value: unknown): SkinCurrency {
  if (value !== 'POINTS' && value !== 'P_CASH') return invalid()
  return value
}
export function validateCollectionBuy(value: unknown): CollectionBuyInput {
  const r = record(value)
  if (
    typeof r.quoteHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(r.quoteHash) ||
    typeof r.requestKey !== 'string' ||
    !uuid.test(r.requestKey)
  )
    return invalid()
  return {
    currency: validateCollectionCurrency(r.currency),
    quoteHash: r.quoteHash,
    requestKey: r.requestKey
  }
}
const mediaUrl = (value: unknown): value is string => {
  try {
    if (typeof value !== 'string' || value.length > 2048) return false
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}
function parseCollection(value: unknown): SkinCollection {
  const r = record(value)
  validateCollectionId(r.id)
  if (
    typeof r.name !== 'string' ||
    !r.name ||
    r.name.length > 128 ||
    typeof r.description !== 'string' ||
    r.description.length > 4000 ||
    !mediaUrl(r.imageUrl) ||
    !(r.videoUrl === null || mediaUrl(r.videoUrl)) ||
    typeof r.published !== 'boolean' ||
    typeof r.featured !== 'boolean' ||
    !integer(r.discountPercent) ||
    r.discountPercent > 90 ||
    !Array.isArray(r.skinIds) ||
    !r.skinIds.length ||
    r.skinIds.length > 50 ||
    !r.skinIds.every((id) => typeof id === 'string' && uuid.test(id)) ||
    new Set(r.skinIds).size !== r.skinIds.length
  )
    return invalid()
  return r as unknown as SkinCollection
}
export function parseCollections(value: unknown): SkinCollection[] {
  if (!Array.isArray(value) || value.length > 1000) return invalid()
  return value.map(parseCollection)
}
export function parseCollectionDetail(value: unknown): CollectionDetail {
  const r = record(value)
  const collection = parseCollection(r.collection)
  if (!Array.isArray(r.items) || r.items.length > 50) return invalid()
  for (const value of r.items) {
    const item = record(value)
    if (
      typeof item.id !== 'string' ||
      !collection.skinIds.includes(item.id) ||
      item.status !== 'ACTIVE' ||
      typeof item.name !== 'string' ||
      typeof item.weaponKey !== 'string' ||
      typeof item.gameVersion !== 'string' ||
      typeof item.owned !== 'boolean' ||
      !integer(item.pricePoints) ||
      typeof item.pointsEnabled !== 'boolean' ||
      !(item.pricePCash === null || integer(item.pricePCash)) ||
      !integer(item.viewerPCash)
    )
      return invalid()
    for (const key of [
      'description',
      'viewModelPath',
      'playerModelPath',
      'worldModelPath',
      'actionSoundPath',
      'explosionSpritePath',
      'availableFrom',
      'availableUntil',
      'creatorUrl',
      'licenseUrl'
    ])
      if (!(item[key] === null || typeof item[key] === 'string')) return invalid()
    for (const key of ['creatorName', 'sourceUrl', 'licenseName', 'attributionText'])
      if (typeof item[key] !== 'string') return invalid()
  }
  return { collection, items: r.items as CollectionDetail['items'] }
}
export function parseCollectionQuote(value: unknown): CollectionQuote {
  const r = record(value)
  validateCollectionId(r.collectionId)
  validateCollectionCurrency(r.currency)
  if (
    !integer(r.subtotal) ||
    !integer(r.total) ||
    r.total > r.subtotal ||
    !integer(r.discountPercent) ||
    r.discountPercent > 90 ||
    typeof r.quoteHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(r.quoteHash) ||
    !Array.isArray(r.items) ||
    !r.items.length ||
    r.items.length > 50
  )
    return invalid()
  let sum = 0
  for (const value of r.items) {
    const i = record(value)
    if (typeof i.skinId !== 'string' || !uuid.test(i.skinId) || !integer(i.price)) return invalid()
    sum += i.price
  }
  if (sum !== r.total || new Set(r.items.map((i) => i.skinId)).size !== r.items.length)
    return invalid()
  return r as unknown as CollectionQuote
}
export function parseCollectionPurchase(value: unknown): CollectionPurchase {
  const r = record(value),
    receipt = record(r.receipt)
  if (
    !integer(r.points) ||
    !integer(r.pCash) ||
    !integer(receipt.total) ||
    typeof receipt.requestKey !== 'string' ||
    !uuid.test(receipt.requestKey)
  )
    return invalid()
  validateCollectionId(receipt.collectionId)
  validateCollectionCurrency(receipt.currency)
  return r as unknown as CollectionPurchase
}
