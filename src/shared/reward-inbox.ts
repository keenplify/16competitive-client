export const REWARD_CHANNELS = { pending: 'rewards:pending', consume: 'rewards:consume' } as const
export type RewardKind = 'POINTS' | 'P_CASH' | 'SKIN' | 'STICKER' | 'SHOWCASE'
export interface RewardReceipt {
  id: string
  type: RewardKind
  itemId: string
  amount: number
  name: string | null
  weaponKey: string | null
  imagePath: string | null
  pricePoints?: number | null
  pricePCash?: number | null
  pointsEnabled?: boolean
  previewRotation?: [number, number, number] | null
  previewHiddenTextures?: string[] | null
}
export interface RewardInbox {
  rewards: RewardReceipt[]
}
export interface RewardInboxApi {
  pending(): Promise<RewardInbox>
  consume(ids: string[]): Promise<void>
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function validRewardIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 500 &&
    value.every((id) => typeof id === 'string' && uuid.test(id)) &&
    new Set(value).size === value.length
  )
}
export function parseRewardInbox(value: unknown): RewardInbox {
  if (
    !value ||
    typeof value !== 'object' ||
    !('rewards' in value) ||
    !Array.isArray(value.rewards) ||
    value.rewards.length > 500
  )
    throw new Error('Invalid reward inbox')
  const rewards: RewardReceipt[] = value.rewards.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid reward')
    const r = row as Record<string, unknown>
    if (
      typeof r.id !== 'string' ||
      !uuid.test(r.id) ||
      !['POINTS', 'P_CASH', 'SKIN', 'STICKER', 'SHOWCASE'].includes(String(r.type)) ||
      typeof r.itemId !== 'string' ||
      r.itemId.length > 200 ||
      !Number.isSafeInteger(r.amount) ||
      Number(r.amount) <= 0 ||
      Number(r.amount) > 2147483647 ||
      !(r.name === null || (typeof r.name === 'string' && r.name.length <= 500)) ||
      !(
        r.weaponKey === null ||
        (typeof r.weaponKey === 'string' && /^[a-z0-9_/-]{1,100}$/.test(r.weaponKey))
      ) ||
      !(
        r.imagePath === null ||
        (typeof r.imagePath === 'string' &&
          /^media\/16competitive\/stickers\/[a-f0-9]{64}\/image\.png$/.test(r.imagePath))
      ) ||
      (r.type === 'SKIN' && (!uuid.test(r.itemId) || !r.weaponKey))
    )
      throw new Error('Invalid reward')
    for (const field of ['pricePoints', 'pricePCash']) {
      if (
        r[field] !== undefined &&
        r[field] !== null &&
        (!Number.isSafeInteger(r[field]) || Number(r[field]) < 0 || Number(r[field]) > 2147483647)
      )
        throw new Error('Invalid reward price')
    }
    if (r.pointsEnabled !== undefined && typeof r.pointsEnabled !== 'boolean')
      throw new Error('Invalid reward pricing')
    if (
      r.previewRotation != null &&
      (!Array.isArray(r.previewRotation) ||
        r.previewRotation.length !== 3 ||
        !r.previewRotation.every(
          (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 360
        ))
    )
      throw new Error('Invalid reward preview')
    if (
      r.previewHiddenTextures != null &&
      (!Array.isArray(r.previewHiddenTextures) ||
        r.previewHiddenTextures.length > 64 ||
        !r.previewHiddenTextures.every((v) => typeof v === 'string' && v.length <= 128))
    )
      throw new Error('Invalid reward preview')
    return {
      pricePoints: r.pricePoints as number | null | undefined,
      pricePCash: r.pricePCash as number | null | undefined,
      pointsEnabled: r.pointsEnabled as boolean | undefined,
      previewRotation: r.previewRotation as [number, number, number] | null | undefined,
      previewHiddenTextures: r.previewHiddenTextures as string[] | null | undefined,
      id: r.id,
      type: r.type as RewardKind,
      itemId: r.itemId,
      amount: Number(r.amount),
      name: r.name as string | null,
      weaponKey: r.weaponKey as string | null,
      imagePath: r.imagePath as string | null
    }
  })
  if (new Set(rewards.map((r) => r.id)).size !== rewards.length) throw new Error('Duplicate reward')
  return { rewards }
}
export function combineRewards(receipts: RewardReceipt[]): RewardReceipt[] {
  const combined = new Map<string, RewardReceipt>()
  for (const reward of receipts) {
    const key = `${reward.type}:${reward.itemId}:${reward.imagePath ?? ''}`
    const previous = combined.get(key)
    if (previous) previous.amount += reward.amount
    else combined.set(key, { ...reward })
  }
  return [...combined.values()].sort((a, b) => {
    const order: RewardKind[] = ['POINTS', 'P_CASH', 'SKIN', 'STICKER', 'SHOWCASE']
    return order.indexOf(a.type) - order.indexOf(b.type)
  })
}
