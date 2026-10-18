import { useMatchDetailsStore } from './match-details.store'
import { create } from 'zustand'
import type { PlayerProfile } from '../../../../shared/match-history'

interface ProfileRequest {
  status: 'loading' | 'ready' | 'error'
  profile: PlayerProfile | null
  requestId: number
}
export type PublicProfileTab = 'overview' | 'skins' | 'matches'
interface ProfileReturnPoint {
  selectedId: string | null
  tab: PublicProfileTab
  matchId: string
}
interface ProfileState {
  returnPoints: ProfileReturnPoint[]
  openFromMatch: (playerId: string, matchId: string) => void
  tab: PublicProfileTab
  setTab: (tab: PublicProfileTab) => void
  selectedId: string | null
  entries: Record<string, ProfileRequest>
  open: (playerId: string) => void
  dismiss: () => void
  close: () => void
  load: (playerId: string) => Promise<void>
  reset: () => void
}
let requestId = 0
export const useProfileStore = create<ProfileState>((set, get) => ({
  returnPoints: [],
  tab: 'overview',
  setTab: (tab) => set({ tab }),
  selectedId: null,
  entries: {},
  open: (selectedId) => set({ selectedId, tab: 'overview', returnPoints: [] }),
  openFromMatch: (selectedId, matchId) =>
    set((state) => ({
      selectedId,
      tab: 'overview',
      returnPoints: [
        ...state.returnPoints,
        { selectedId: state.selectedId, tab: state.tab, matchId }
      ]
    })),
  dismiss: () => set({ selectedId: null, returnPoints: [], tab: 'overview' }),
  close: () => {
    const previous = get().returnPoints.at(-1)
    if (!previous) {
      set({ selectedId: null })
      return
    }
    set((state) => ({
      selectedId: previous.selectedId,
      tab: previous.tab,
      returnPoints: state.returnPoints.slice(0, -1)
    }))
    void useMatchDetailsStore.getState().open(previous.matchId)
  },
  reset: () => set({ selectedId: null, entries: {}, returnPoints: [], tab: 'overview' }),
  load: async (playerId) => {
    const id = ++requestId
    set((state) => ({
      entries: { ...state.entries, [playerId]: { status: 'loading', profile: null, requestId: id } }
    }))
    try {
      const profile = await window.api.matchHistory.getPlayerProfile(playerId)
      if (get().entries[playerId]?.requestId !== id) return
      set((state) => ({
        entries: { ...state.entries, [playerId]: { status: 'ready', profile, requestId: id } }
      }))
    } catch (error) {
      console.warn('[Profile] Could not load profile', error)
      if (get().entries[playerId]?.requestId !== id) return
      set((state) => ({
        entries: { ...state.entries, [playerId]: { status: 'error', profile: null, requestId: id } }
      }))
    }
  }
}))
