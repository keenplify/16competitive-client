import type { PaymentOrder, PaymentSnapshot } from './payments'

export const SKIN_CHANNELS = {
  collections: 'skins:collections',
  collection: 'skins:collection',
  collectionQuote: 'skins:collection-quote',
  collectionBuy: 'skins:collection-buy',
  musicKits: 'skins:music-kits',
  musicBuy: 'skins:music-buy',
  musicEquip: 'skins:music-equip',
  musicPreview: 'skins:music-preview',
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
  setCharacter: 'skins:set-character',
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

export const STOCK_CHARACTERS = {
  ct: ['urban', 'gsg9', 'sas', 'gign'],
  t: ['terror', 'leet', 'arctic', 'guerilla']
} as const
export type CharacterTeam = keyof typeof STOCK_CHARACTERS

export interface LobbyLoadout {
  ctCharacter?: string
  tCharacter?: string
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
  collections(): Promise<import('./skin-collections').SkinCollection[]>
  collection(id: string): Promise<import('./skin-collections').CollectionDetail>
  collectionQuote(
    id: string,
    currency: SkinCurrency
  ): Promise<import('./skin-collections').CollectionQuote>
  collectionBuy(
    id: string,
    input: import('./skin-collections').CollectionBuyInput
  ): Promise<import('./skin-collections').CollectionPurchase>
  musicKits(): Promise<import('./music-kits').MusicKitSnapshot>
  musicBuy(id: string, expectedPrice: number): Promise<{ points: number }>
  musicEquip(id: string | null, team: import('./music-kits').MusicTeam): Promise<void>
  musicPreview(id: string, event: import('./music-kits').MusicEvent): Promise<ArrayBuffer>
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
  setCharacter(team: CharacterTeam, model: string): Promise<void>
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
