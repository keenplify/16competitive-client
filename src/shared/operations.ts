import type { SkinPreviewRotation } from './skin-preview-rotation'
export const OPERATION_CHANNELS = {
  getActive: 'operations:get-active',
  getMine: 'operations:get-mine',
  markViewed: 'operations:mark-viewed'
} as const

export type OperationRewardType = 'SKIN' | 'POINTS' | 'P_CASH' | 'SHOWCASE' | 'STICKER'
export type OperationPhase = 'SCHEDULED' | 'RUNNING' | 'ENDED'
export type OperationAccessType = 'FREE' | 'PREMIUM'

export interface OperationTier {
  id: string
  tier: number
  requiredPoints: number
  isMajor: boolean
  rewardType: OperationRewardType
  stickerId?: string | null
  sticker?: { id: string; name: string | null; imagePath: string | null } | null
  skinId: string | null
  amount: number | null
  showcaseKey: string | null
  showcaseName: string | null
  skin: {
    id: string
    name: string | null
    previewHiddenTextures?: string[]
    previewRotation?: SkinPreviewRotation
    weaponKey: string | null
    description: string | null
  } | null
}

export interface Operation {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  isActive: boolean
  accessType: OperationAccessType
  pricePCash: number | null
  logoUrl: string | null
  /** Optional lobby-card artwork; older Operations fall back to heroUrl. */
  bannerUrl?: string | null
  heroUrl: string | null
  durationDays: number
  phase: OperationPhase
  tiers: OperationTier[]
}

export interface OperationProgress {
  points: number
  lastViewedPoints: number
  updatedAt: string | null
}

export interface OperationSnapshot {
  operation: Operation | null
  progress: OperationProgress | null
}

export interface OperationViewedResult {
  points: number
  lastViewedPoints: number
}

export interface OperationsApi {
  getActive(): Promise<Operation | null>
  getMine(): Promise<OperationSnapshot>
  markViewed(operationId: string, viewedPoints: number): Promise<OperationViewedResult>
}

/** Validate sticker metadata before either renderer uses the new reward variant. */
export function isOperationStickerTier(value: Record<string, unknown>): boolean {
  if (value.rewardType !== 'STICKER') return true
  const sticker = value.sticker
  return typeof value.stickerId === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.stickerId) &&
    Number.isInteger(value.amount) && Number(value.amount) >= 1 && Number(value.amount) <= 100 &&
    !!sticker && typeof sticker === 'object' &&
    (sticker as Record<string, unknown>).id === value.stickerId &&
    typeof (sticker as Record<string, unknown>).name === 'string' &&
    typeof (sticker as Record<string, unknown>).imagePath === 'string' &&
    /^media\/16competitive\/stickers\/[a-f0-9]{64}\/image\.png$/.test(String((sticker as Record<string, unknown>).imagePath))
}

export function validateOperationStickerRewards(operation: Operation | null): Operation | null {
  if (operation && (!Array.isArray(operation.tiers) || operation.tiers.some(tier =>
    !tier || typeof tier !== 'object' || !isOperationStickerTier(tier as unknown as Record<string, unknown>))))
    throw new Error('Invalid operation sticker reward')
  return operation
}
