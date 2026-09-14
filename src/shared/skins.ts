export const SKIN_CHANNELS = {
  list: 'skins:list',
  mine: 'skins:mine',
  getLobbyLoadout: 'skins:get-lobby-loadout',
  unlock: 'skins:unlock',
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

export interface UnlockResult {
  skin: Skin
  points: number
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
  getLobbyLoadout(): Promise<LobbyLoadout>
  unlock(skinId: string): Promise<UnlockResult>
  equip(skinId: string): Promise<void>
  unequip(skinId: string): Promise<void>
  previewModel(skinId: string): Promise<ArrayBuffer>
  setLobbyWeapon(skinId: string): Promise<void>
  setLobbyWeaponKey(weaponKey: string): Promise<void>
  setLobbyPlayerModel(modelPath: string): Promise<void>
}
