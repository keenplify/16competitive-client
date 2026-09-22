import { create } from 'zustand'
import type { TopMmrLeaderboard } from '../../../../shared/leaderboard'

type LeaderboardStatus = 'idle' | 'loading' | 'ready' | 'error'
export type LeaderboardScope = 'global' | 'continental'

interface LeaderboardState {
  leaderboard: TopMmrLeaderboard | null
  scope: LeaderboardScope
  status: LeaderboardStatus
  continentOf: string | null
  playerCountryCode: string | null
  load(continentOf?: string): Promise<void>
}

export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
  leaderboard: null,
  scope: 'global',
  status: 'idle',
  continentOf: null,
  playerCountryCode: null,
  load: async (continentOf) => {
    if (get().status === 'loading' && get().continentOf === (continentOf ?? null)) return

    set({
      status: 'loading',
      scope: continentOf ? 'continental' : 'global',
      continentOf: continentOf ?? null
    })
    try {
      const leaderboard = await window.api.leaderboard.getTopMmr(continentOf)
      if (get().continentOf !== (continentOf ?? null)) return
      set({
        leaderboard,
        status: 'ready',
        ...(continentOf === undefined && {
          playerCountryCode: leaderboard.currentPlayer?.flagCountryCode ?? null
        })
      })
    } catch (error) {
      console.error('[Leaderboard] failed to load top MMR', { continentOf, error })
      if (get().continentOf === (continentOf ?? null)) set({ status: 'error' })
    }
  }
}))
