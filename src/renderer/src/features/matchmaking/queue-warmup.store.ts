import { isWebRuntime } from '../../web-runtime'
import { create } from 'zustand'
import type { MatchmakingEvent, MatchmakingMode } from '../../../../shared/matchmaking'

type WarmupState = {
  remindAt: number
  deferReminder: () => void
  dismissed: boolean
  status: 'idle' | 'starting' | 'ready' | 'playing' | 'leaving' | 'error'
  matchId: string | null
  mode: MatchmakingMode
  mapId: string
  open: () => void
  dismiss: () => void
  select: (mode: MatchmakingMode, mapId: string) => void
  join: () => Promise<void>
  launch: () => Promise<void>
  leave: () => Promise<void>
  handleEvent: (event: MatchmakingEvent) => void
}

export const useQueueWarmupStore = create<WarmupState>((set, get) => ({
  remindAt: 0,
  deferReminder: () => set({ remindAt: Date.now() + 5 * 60_000 }),
  dismissed: false,
  status: 'idle',
  matchId: null,
  mode: 'arena',
  mapId: '',
  open: () => set({ dismissed: false }),
  dismiss: () => set({ dismissed: true, remindAt: Date.now() + 5 * 60_000 }),
  select: (mode, mapId) => set({ mode, mapId }),
  join: async () => {
    if (get().status === 'starting' || get().status === 'playing') return
    set({ status: 'starting' })
    try {
      await window.api.matchmaking.joinWarmup(get().mode, get().mapId)
    } catch {
      set({ status: 'error' })
    }
  },
  launch: async () => {
    const matchId = get().matchId
    if (!matchId) return
    try {
      await window.api.matchmaking.reconnectGame(matchId)
      if (get().matchId === matchId) set({ status: 'playing', dismissed: true })
    } catch { if (get().matchId === matchId) set({ status: 'error' }) }
  },
  leave: async () => {
    set({ status: 'leaving' })
    try {
      await window.api.matchmaking.leaveWarmup()
      set({ status: 'idle', matchId: null, dismissed: true, remindAt: Date.now() + 5 * 60_000 })
    } catch {
      set({ status: 'error' })
    }
  },
  handleEvent: (event) => {
    if (event.whileQueued) {
      if (event.type === 'match_found' || event.type === 'match_roster')
        set({ matchId: event.matchId, mode: event.mode, mapId: event.mapId, status: get().matchId === event.matchId && ['ready', 'playing'].includes(get().status) ? get().status : 'starting' })
      else if (event.type === 'match_connect' && get().matchId === event.matchId) {
        if (isWebRuntime()) {
          if (get().status === 'playing' || get().status === 'ready') return
          // The manual-admission endpoint opens after the existing server startup grace period.
          window.setTimeout(() => {
            if (get().matchId === event.matchId && get().status === 'starting')
              set({ status: 'ready', dismissed: false })
          }, 10_000)
        } else set({ status: 'playing', dismissed: true })
      }
      else if (event.type === 'error') set({ status: 'error', dismissed: false })
      else if (
        (event.type === 'match_finished' ||
          event.type === 'match_cancelled' ||
          event.type === 'game_process_exited') &&
        get().matchId === event.matchId
      )
        set({ status: 'idle', matchId: null, dismissed: true, remindAt: Date.now() + 5 * 60_000 })
      return
    }
    if (event.type === 'authenticated')
      set({ status: 'idle', matchId: null, dismissed: true, remindAt: Date.now() + 5 * 60_000 })
    if (event.type === 'queue_joined' && event.mode === '5v5')
      set({ dismissed: get().matchId !== null })
  }
}))
