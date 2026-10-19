import type { PaymentOrder, PaymentSnapshot } from './payments'

export const SKIN_CHANNELS = {
  payments: 'skins:payments',
  createPayment: 'skins:create-payment',
  createManualPayment: 'skins:create-manual-payment',
  submitManualPayment: 'skins:submit-manual-payment',
  cancelManualPayment: 'skins:cancel-manual-payment',
  refreshPayment: 'skins:refresh-payment',
  list: 'skins:list',
  mine: 'skins:mine',
  resaleQuote: 'skins:resale-quote',
  sell: 'skins:sell',
  getLobbyLoadout: 'skins:get-lobby-loadout',
  unlock: 'skins:unlock',
  equip: 'skins:equip',
  unequip: 'skins:unequip',
  previewModel: 'skins:preview-model',
  previewExplosionSprite: 'skins:preview-explosion-sprite',
  setLobbyWeapon: 'skins:set-lobby-weapon',
  setLobbyWeaponKey: 'skins:set-lobby-weapon-key',
  setLobbyPlayerModel: 'skins:set-lobby-player-model',
  pendingGift: 'skins:pending-gift',
  claimGift: 'skins:claim-gift'
} as const

export interface Skin {
  id: string
  gameVersion: string
  status: 'DRAFT' | 'ACTIVE' | 'UNLISTED' | 'DISABLED'
  weaponKey: string
  name: string
  description: string | null
  pricePoints: number
  pointsEnabled: boolean
  pricePCash: number | null
  viewerPCash: number
  availableFrom: string | null
  availableUntil: string | null
  creatorName: string
  creatorUrl: string | null
  sourceUrl: string
  licenseName: string
  licenseUrl: string | null
  attributionText: string
  viewModelPath: string | null
  playerModelPath: string | null
  worldModelPath: string | null
  actionSoundPath: string | null
  explosionSpritePath: string | null
}

export interface OwnedSkin {
  skin: Skin
  reviewOnly?: boolean
  acquiredAt: string
  acquiredForPoints: number
  equippedAt: string | null
  lobbySelected: boolean
}

/** The backend preview endpoint serves the immutable player model path. */
export const skinPreviewRevision = (skin: Pick<Skin, 'playerModelPath'>): string =>
  skin.playerModelPath ?? 'unavailable'

export interface SkinResaleQuote {
  skinId: string
  currency: SkinCurrency
  purchasePrice: number
  payout: number
}

export interface SkinResaleResult extends SkinResaleQuote {
  balance: number
}

export interface UnlockResult {
  skin: Skin
  points?: number
  pCash?: number
  currency: 'POINTS' | 'P_CASH'
}

export type SkinCurrency = 'POINTS' | 'P_CASH'

export interface LobbyLoadout {
  playerModel: string
  weaponSkinId: string | null
  weaponKey: string
  weaponModelPath: string | null
}

export interface SkinGiftSkinChoice {
  id: string
  type: 'SKIN'
  skinId: string
  weaponKey: string
  name: string
  description: string | null
  owned: boolean
}

export interface SkinGiftPointsChoice {
  id: string
  type: 'POINTS'
  points: number
  name: string
  description: null
  owned: false
}

export interface SkinGiftPCoinsChoice {
  id: string
  type: 'P_COINS'
  pCoins: number
  name: string
  description: null
  owned: false
}

export type SkinGiftChoice = SkinGiftSkinChoice | SkinGiftPointsChoice | SkinGiftPCoinsChoice

export interface SkinGift {
  id: string
  kind: 'WELCOME' | 'ADMIN'
  title: string
  choices: SkinGiftChoice[]
  createdAt: string
}

export interface SkinsApi {
  payments(): Promise<PaymentSnapshot>
  createManualPayment(
    requestId: string,
    methodId: string,
    amount: number
  ): Promise<import('./payments').ManualOrder>
  submitManualPayment(
    id: string,
    senderName: string,
    reference: string
  ): Promise<import('./payments').ManualOrder>
  cancelManualPayment(id: string): Promise<import('./payments').ManualOrder>
  createPayment(requestId: string, amount: number): Promise<PaymentOrder>
  refreshPayment(id: string): Promise<PaymentSnapshot>
  list(weaponKey?: string): Promise<Skin[]>
  mine(): Promise<OwnedSkin[]>
  resaleQuote(skinId: string): Promise<SkinResaleQuote>
  sell(skinId: string, quote: SkinResaleQuote): Promise<SkinResaleResult>
  getLobbyLoadout(): Promise<LobbyLoadout>
  unlock(skinId: string, currency: SkinCurrency): Promise<UnlockResult>
  equip(skinId: string): Promise<void>
  unequip(skinId: string): Promise<void>
  previewModel(skinId: string): Promise<ArrayBuffer>
  previewExplosionSprite(skinId: string): Promise<ArrayBuffer | null>
  setLobbyWeapon(skinId: string): Promise<void>
  setLobbyWeaponKey(weaponKey: string): Promise<void>
  setLobbyPlayerModel(modelPath: string): Promise<void>
  pendingGift(): Promise<SkinGift | null>
  claimGift(
    giftId: string,
    rewardId: string
  ): Promise<{
    reward: SkinGiftChoice
    pointsGranted?: number
    pCoinsGranted?: number
  }>
}
