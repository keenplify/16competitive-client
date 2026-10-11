import { create } from 'zustand'
import type { QueuedPlayer } from '../../../../shared/matchmaking'
import { useAuthStore } from '../auth/auth.store'
import { useFriendsStore } from '../friends/friends.store'

export interface ReadyPlayerRank {
  level: number
  levelTitle: string
}

function readRank(value: { level?: number; levelTitle?: string }): ReadyPlayerRank | null {
  return Number.isInteger(value.level) &&
    Number(value.level) >= 1 &&
    Number(value.level) <= 40 &&
    typeof value.levelTitle === 'string' &&
    value.levelTitle.length <= 80
    ? { level: value.level as number, levelTitle: value.levelTitle }
    : null
}

interface ReadyPlayerRanksState {
  matchId: string | null
  ranks: Record<string, ReadyPlayerRank>
  load: (matchId: string, players: QueuedPlayer[]) => Promise<void>
}

export const useReadyPlayerRanksStore = create<ReadyPlayerRanksState>((set, get) => ({
  matchId: null,
  ranks: {},
  load: async (matchId, players) => {
    if (get().matchId === matchId) return
    const ranks: Record<string, ReadyPlayerRank> = {}
    const known = [...useFriendsStore.getState().friends]
    const own = useAuthStore.getState().session?.player
    for (const player of players) {
      const source = player.id === own?.id ? own : known.find((friend) => friend.id === player.id)
      const rank = source ? readRank(source) : null
      if (rank) ranks[player.id] = rank
    }
    set({ matchId, ranks })
    // At most ten profiles per ready check. Cached social ranks display immediately.
    await Promise.all(
      players
        .filter((player) => !ranks[player.id])
        .map(async (player) => {
          try {
            const profile = await window.api.matchHistory.getPlayerProfile(player.id)
            const rank = profile.id === player.id ? readRank(profile) : null
            if (rank && get().matchId === matchId) {
              set((state) => ({ ranks: { ...state.ranks, [player.id]: rank } }))
            }
          } catch (error) {
            console.warn('[ReadyCheck] rank unavailable', { playerId: player.id, error })
          }
        })
    )
  }
}))
