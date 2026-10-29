import { useLobbyLoadoutStore } from '../party/lobby-loadout.store'
import { create } from 'zustand'
import { STOCK_CHARACTERS, type CharacterTeam } from '../../../../shared/skins'

interface CharacterLoadoutState {
  team: CharacterTeam
  stock: Record<CharacterTeam, string>
  pending: boolean
  partyPending: boolean
  showInParty: (modelPath: string) => Promise<void>
  selectTeam: (team: CharacterTeam) => void
  setStock: (ct?: string, t?: string) => void
  equipStock: (team: CharacterTeam, model: string) => Promise<void>
}
export const useCharacterLoadoutStore = create<CharacterLoadoutState>((set) => ({
  team: 'ct',
  stock: { ct: 'gign', t: 'terror' },
  pending: false,
  partyPending: false,
  showInParty: async (modelPath) => {
    set({ partyPending: true })
    try {
      await window.api.skins.setLobbyPlayerModel(modelPath)
      useLobbyLoadoutStore.getState().setPlayerModel(modelPath)
    } finally {
      set({ partyPending: false })
    }
  },
  selectTeam: (team) => set({ team }),
  setStock: (ct, t) =>
    set({
      stock: {
        ct: (STOCK_CHARACTERS.ct as readonly string[]).includes(ct ?? '') ? ct! : 'gign',
        t: (STOCK_CHARACTERS.t as readonly string[]).includes(t ?? '') ? t! : 'terror'
      }
    }),
  equipStock: async (team, model) => {
    set({ pending: true })
    try {
      await window.api.skins.setCharacter(team, model)
      set((state) => ({ stock: { ...state.stock, [team]: model } }))
    } finally {
      set({ pending: false })
    }
  }
}))
