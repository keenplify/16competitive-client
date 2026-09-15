export const SKIN_CHANNELS = {
  list: 'skins:list',
  mine: 'skins:mine',
  wallet: 'skins:wallet',
  getLobbyLoadout: 'skins:get-lobby-loadout',
  unlock: 'skins:unlock',
  unlockPCash: 'skins:unlock-p-cash',
  equip: 'skins:equip',
  unequip: 'skins:unequip',
  previewModel: 'skins:preview-model',
  setLobbyWeapon: 'skins:set-lobby-weapon',
  setLobbyWeaponKey: 'skins:set-lobby-weapon-key',
  setLobbyPlayerModel: 'skins:set-lobby-player-model'
} as const

export interface Skin {
  id: string
  gameVersion: string
  weaponKey: string
  name: string
  description: string | null
  pricePoints: number
  pointsEnabled: boolean
  pricePCash: number | null
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
  lobbySelected: boolean
}

export interface StoreWallet {
  points: number
  pCash: number
}

export interface UnlockResult {
  skin: Skin
  points: number
}

export interface PCashUnlockResult {
  skin: Skin
  pCash: number
}

export interface LobbyLoadout {
  playerModel: string
  weaponSkinId: string | null
  weaponKey: string
  weaponModelPath: string | null
}

export interface SkinsApi {
  list(weaponKey?: string): Promise<Skin[]>
  mine(): Promise<OwnedSkin[]>
  wallet(): Promise<StoreWallet>
  getLobbyLoadout(): Promise<LobbyLoadout>
  unlock(skinId: string): Promise<UnlockResult>
  unlockPCash(skinId: string): Promise<PCashUnlockResult>
  equip(skinId: string): Promise<void>
  unequip(skinId: string): Promise<void>
  previewModel(skinId: string): Promise<ArrayBuffer>
  setLobbyWeapon(skinId: string): Promise<void>
  setLobbyWeaponKey(weaponKey: string): Promise<void>
  setLobbyPlayerModel(modelPath: string): Promise<void>
}
