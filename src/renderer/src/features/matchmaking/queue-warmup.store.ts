import { isWebRuntime } from '../../web-runtime'
import { create } from 'zustand'
import type { MatchmakingEvent, MatchmakingMode } from '../../../../shared/matchmaking'
import type { CompletedMatch } from './matchmaking.store'

type WarmupState = {
  browsing: boolean
  status: 'idle' | 'starting' | 'ready' | 'playing' | 'leaving' | 'error'
  matchId: string | null
  completedMatch: CompletedMatch | null
  dismissCompletedMatch: () => void
  mode: MatchmakingMode
  mapId: string
  selectedMapIds: string[]
  availableMapIds: string[]
  syncMaps: (mode: MatchmakingMode, mapIds: string[]) => void
  toggleMap: (mapId: string) => void
  open: () => void
  dismiss: () => void
  select: (mode: MatchmakingMode, mapIds: string | string[]) => void
  join: () => Promise<void>
  launch: () => Promise<void>
  leave: () => Promise<void>
  handleEvent: (event: MatchmakingEvent) => void
}

export const useQueueWarmupStore = create<WarmupState>((set, get) => ({
  browsing: false,
  status: 'idle',
  matchId: null,
  completedMatch: null,
  dismissCompletedMatch: () => set({ completedMatch: null }),
  mode: 'ffa',
  mapId: '',
  selectedMapIds: [],
  availableMapIds: [],
  open: () => set({ browsing: true }),
  dismiss: () => set({ browsing: false }),
  select: (mode, selection) =>
    set({
      mode,
      selectedMapIds: typeof selection === 'string' ? (selection ? [selection] : []) : selection,
      availableMapIds: []
    }),
  syncMaps: (mode, mapIds) =>
    set((state) => {
      if (
        state.mode === mode &&
        state.availableMapIds.length === mapIds.length &&
        state.availableMapIds.every((id, index) => id === mapIds[index])
      )
        return state
      const previous = state.mode === mode ? state.availableMapIds : []
      return {
        mode,
        availableMapIds: mapIds,
        selectedMapIds: mapIds.filter(
          (id) => !previous.includes(id) || state.selectedMapIds.includes(id)
        )
      }
    }),
  toggleMap: (mapId) =>
    set((state) => {
      if (
        state.matchId ||
        state.status === 'starting' ||
        state.status === 'leaving' ||
        !state.availableMapIds.includes(mapId)
      )
        return state
      return {
        selectedMapIds: state.selectedMapIds.includes(mapId)
          ? state.selectedMapIds.filter((id) => id !== mapId)
          : [...state.selectedMapIds, mapId]
      }
    }),
  join: async () => {
    if (
      get().matchId ||
      get().status === 'starting' ||
      get().status === 'leaving' ||
      get().mode === '5v5' ||
      get().selectedMapIds.length === 0
    )
      return
    set({ status: 'starting' })
    try {
      await window.api.matchmaking.joinWarmup(get().mode, get().selectedMapIds)
    } catch {
      set({ status: 'error' })
    }
  },
  launch: async () => {
    const matchId = get().matchId
    if (!matchId) return
    try {
      await window.api.matchmaking.reconnectGame(matchId)
      if (get().matchId === matchId) set({ status: 'playing' })
    } catch {
      if (get().matchId === matchId) set({ status: 'error' })
    }
  },
  leave: async () => {
    set({ status: 'leaving' })
    try {
      await window.api.matchmaking.leaveWarmup()
      set({ status: 'idle', matchId: null })
    } catch {
      set({ status: 'error' })
    }
  },
  handleEvent: (event) => {
    if (event.whileQueued) {
      if (event.type === 'match_found' || event.type === 'match_roster')
        set({
          matchId: event.matchId,
          mode: event.mode,
          mapId: event.mapId,
          status:
            get().matchId === event.matchId && ['ready', 'playing'].includes(get().status)
              ? get().status
              : 'starting'
        })
      else if (event.type === 'match_connect' && get().matchId === event.matchId) {
        if (isWebRuntime()) {
          if (get().status === 'playing' || get().status === 'ready') return
          // The manual-admission endpoint opens after the existing server startup grace period.
          window.setTimeout(() => {
            if (get().matchId === event.matchId && get().status === 'starting')
              set({ status: 'ready' })
          }, 10_000)
        } else set({ status: 'playing' })
      } else if (event.type === 'error') set({ status: 'error' })
      else if (
        (event.type === 'match_finished' ||
          event.type === 'match_cancelled' ||
          event.type === 'game_process_exited') &&
        get().matchId === event.matchId
      )
        set({
          status: 'idle',
          matchId: null,
          ...(event.type === 'match_finished' && event.publicFfa ? { completedMatch: event } : {})
        })
      return
    }
    if (event.type === 'authenticated')
      set({ status: 'idle', matchId: null, browsing: false, completedMatch: null })
    if (event.type === 'match_found' || event.type === 'match_ready_check')
      set({ completedMatch: null })
    if (event.type === 'queue_left' || event.type === 'match_found') set({ browsing: false })
  }
}))
