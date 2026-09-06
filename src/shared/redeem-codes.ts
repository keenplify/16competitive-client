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
  skinId: string | null
  skinGranted: boolean
}

export type RedeemCodeResponse =
  | { ok: true; result: RedeemCodeResult }
  | { ok: false; error: RedeemCodeErrorCode; message: string }

export interface RedeemCodesApi {
  redeem(code: string): Promise<RedeemCodeResponse>
}
