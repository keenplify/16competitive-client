import { create } from 'zustand'
import { MARKETING_LOBBY_ENABLED } from './marketing-lobby'

const DEFAULT_PLAYER_MODEL = 'player/gign/gign.mdl'

interface LobbyLoadoutState {
  playerModel: string
  weaponKey: string
  weaponModelPath: string | null
  refresh: () => Promise<void>
  setPlayerModel: (playerModel: string) => void
  setWeapon: (weaponKey: string, weaponModelPath: string | null) => void
}

export const useLobbyLoadoutStore = create<LobbyLoadoutState>((set) => ({
  playerModel: DEFAULT_PLAYER_MODEL,
  weaponKey: 'ak47',
  weaponModelPath: null,
  refresh: async () => {
    if (MARKETING_LOBBY_ENABLED) return
    const loadout = await window.api.skins.getLobbyLoadout?.().catch(() => null)
    if (loadout) {
      set({
        playerModel: loadout.playerModel,
        weaponKey: loadout.weaponKey,
        weaponModelPath: loadout.weaponModelPath
      })
    }
  },
  setPlayerModel: (playerModel) => set({ playerModel }),
  setWeapon: (weaponKey, weaponModelPath) => set({ weaponKey, weaponModelPath })
}))
