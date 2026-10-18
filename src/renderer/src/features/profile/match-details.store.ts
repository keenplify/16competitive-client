import { create } from 'zustand'
import type { MatchSummary } from '../../../../shared/match-history'
interface MatchDetailsState {
  id: string | null
  summary: MatchSummary | null
  status: 'loading' | 'ready' | 'error'
  open: (id: string) => Promise<void>
  close: () => void
}
let request = 0
export const useMatchDetailsStore = create<MatchDetailsState>((set) => ({
  id: null,
  summary: null,
  status: 'loading',
  close: () => {
    request++
    set({ id: null, summary: null })
  },
  open: async (id) => {
    const current = ++request
    set({ id, summary: null, status: 'loading' })
    try {
      const summary = await window.api.matchHistory.getSummary(id)
      if (current === request) set({ summary, status: 'ready' })
    } catch (error) {
      console.warn('[MatchDetails] Could not load match', error)
      if (current === request) set({ status: 'error' })
    }
  }
}))
