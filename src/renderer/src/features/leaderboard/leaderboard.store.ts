import { create } from 'zustand'
import type { TopMmrLeaderboard } from '../../../../shared/leaderboard'

type LeaderboardStatus = 'idle' | 'loading' | 'ready' | 'error'

interface LeaderboardState {
  leaderboard: TopMmrLeaderboard | null
  status: LeaderboardStatus
  countryCode: string | null
  playerCountryCode: string | null
  load(countryCode?: string): Promise<void>
}

export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
  leaderboard: null,
  status: 'idle',
  countryCode: null,
  playerCountryCode: null,
  load: async (countryCode) => {
    if (get().status === 'loading' && get().countryCode === (countryCode ?? null)) return

    set({ status: 'loading', countryCode: countryCode ?? null })
    try {
      const leaderboard = await window.api.leaderboard.getTopMmr(countryCode)
      if (get().countryCode !== (countryCode ?? null)) return
      set({
        leaderboard,
        status: 'ready',
        ...(countryCode === undefined && {
          playerCountryCode: leaderboard.currentPlayer?.flagCountryCode ?? null
        })
      })
    } catch (error) {
      console.error('[Leaderboard] failed to load top MMR', { countryCode, error })
      if (get().countryCode === (countryCode ?? null)) set({ status: 'error' })
    }
  }
}))
