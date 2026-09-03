export const SKIN_CHANNELS = {
  list: 'skins:list',
  mine: 'skins:mine',
  unlock: 'skins:unlock',
  equip: 'skins:equip',
  unequip: 'skins:unequip',
  previewModel: 'skins:preview-model'
} as const

export interface Skin {
  id: string
  gameVersion: string
  weaponKey: string
  name: string
  description: string | null
  pricePoints: number
  availableFrom: string | null
  availableUntil: string | null
  creatorName: string
  creatorUrl: string | null
  sourceUrl: string
  licenseName: string
  licenseUrl: string | null
  attributionText: string
}

export interface OwnedSkin {
  skin: Skin
  acquiredAt: string
  acquiredForPoints: number
  equippedAt: string | null
}

export interface UnlockResult {
  skin: Skin
  points: number
}

export interface SkinsApi {
  list(weaponKey?: string): Promise<Skin[]>
  mine(): Promise<OwnedSkin[]>
  unlock(skinId: string): Promise<UnlockResult>
  equip(skinId: string): Promise<void>
  unequip(skinId: string): Promise<void>
  previewModel(skinId: string): Promise<ArrayBuffer>
}
