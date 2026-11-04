import { create } from 'zustand'
import type { Skin } from '../../../../shared/skins'
import { isCharacterModel } from './skin-model-presentation'

let generation = 0
export const useThumbnailWarmupStore = create<{
  owner: string | null
  skins: Skin[]
  index: number
  load: (owner: string | null) => Promise<void>
  advance: () => void
}>((set, get) => ({
  owner: null,
  skins: [],
  index: 0,
  load: async (owner) => {
    if (get().owner === owner) return
    const current = ++generation
    set({ owner, skins: [], index: 0 })
    if (!owner) return
    try {
      const skins = await window.api.skins.list()
      if (current === generation)
        set({ skins: skins.filter((skin) => !isCharacterModel(skin.weaponKey)) })
    } catch (error) {
      console.warn('[ThumbnailWarmup] Catalog unavailable', error)
    }
  },
  advance: () => set((state) => ({ index: state.index + 1 }))
}))
