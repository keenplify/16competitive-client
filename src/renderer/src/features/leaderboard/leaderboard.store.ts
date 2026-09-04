import { create } from 'zustand'
import type { TopMmrLeaderboard } from '../../../../shared/leaderboard'

type LeaderboardStatus = 'idle' | 'loading' | 'ready' | 'error'

interface LeaderboardState {
  leaderboard: TopMmrLeaderboard | null
  status: LeaderboardStatus
  load(): Promise<void>
}

export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
  leaderboard: null,
  status: 'idle',
  load: async () => {
    if (get().status === 'loading') return
    set({ status: 'loading' })
    try {
      const leaderboard = await window.api.leaderboard.getTopMmr()
      set({ leaderboard, status: 'ready' })
    } catch (error) {
      console.error('[Leaderboard] failed to load top MMR', error)
      set({ status: 'error' })
    }
  }
}))
