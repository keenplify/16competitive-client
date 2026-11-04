export const REDEEM_CODE_CHANNELS = {
  redeem: 'redeem-codes:redeem'
} as const

export type RedeemCodeErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_CODE'
  | 'CODE_NOT_FOUND'
  | 'CODE_EXPIRED'
  | 'CODE_LIMIT_REACHED'
  | 'CODE_ALREADY_REDEEMED'
  | 'INTERNAL_ERROR'

export interface RedeemCodeResult {
  code: string
  pointsGranted: number
  points: number
  pCashGranted?: number
  pCash?: number | null
  skinId: string | null
  skinName?: string | null
  stickerId?: string | null
  stickersGranted?: number
  sticker?: { id: string; name: string; imagePath: string } | null
  skinGranted: boolean
}

export type RedeemCodeResponse =
  | { ok: true; result: RedeemCodeResult }
  | { ok: false; error: RedeemCodeErrorCode; message: string }

export interface RedeemCodesApi {
  redeem(code: string): Promise<RedeemCodeResponse>
}

export const validRedeemRewardDetails = (result: Record<string, unknown>): boolean => {
  const sticker = result.sticker as Record<string, unknown> | null | undefined
  return (result.skinName == null || typeof result.skinName === 'string') &&
    (result.stickerId == null || (typeof result.stickerId === 'string' && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(result.stickerId))) &&
    (result.stickersGranted === undefined || (Number.isInteger(result.stickersGranted) && Number(result.stickersGranted) >= 0 && Number(result.stickersGranted) <= 100)) &&
    (sticker == null || (typeof sticker === 'object' && sticker.id === result.stickerId && typeof sticker.name === 'string' && typeof sticker.imagePath === 'string' && /^media\/16competitive\/stickers\/[a-f0-9]{64}\/image\.png$/.test(sticker.imagePath)))
}
