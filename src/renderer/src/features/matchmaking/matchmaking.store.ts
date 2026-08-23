import { MatchmakingEvent, MatchmakingMode, QueuedPlayer } from '../../../../shared/matchmaking'
import { create } from 'zustand'

type ConnectionStatus = 'disconnected' | 'connecting' | 'reconnecting' | 'authenticating' | 'ready'
type QueueStatus = 'idle' | 'joining' | 'queued' | 'leaving' | 'matched'

interface FoundMatch {
  matchId: string
  mode: MatchmakingMode
  teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
}

interface MatchmakingState {
  connectionStatus: ConnectionStatus
  queueStatus: QueueStatus
  selectedMode: MatchmakingMode
  queuedPlayers: number
  playersRequired: number
  position: number
  match: FoundMatch | null
  error: string | null
  connect: () => Promise<void>
  selectMode: (mode: MatchmakingMode) => void
  joinQueue: () => Promise<void>
  leaveQueue: () => Promise<void>
  reset: () => void
}

let removeEventListener: (() => void) | null = null

const readableError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Matchmaking request failed.'
  const remoteError = error.message.match(/Error: (.+)$/)
  return remoteError?.[1] ?? error.message
}

export const useMatchmakingStore = create<MatchmakingState>((set, get) => {
  const handleEvent = (event: MatchmakingEvent): void => {
    switch (event.type) {
      case 'connection_state':
        set({ connectionStatus: event.state })
        break
      case 'connected':
        set({ connectionStatus: 'authenticating', error: null })
        break
      case 'authenticated':
        set({ connectionStatus: 'ready', error: null })
        break
      case 'queue_joined':
        set({ queueStatus: 'queued', selectedMode: event.mode, error: null })
        break
      case 'queue_status':
        set({
          queueStatus: 'queued',
          selectedMode: event.mode,
          queuedPlayers: event.queuedPlayers,
          playersRequired: event.playersRequired,
          position: event.position,
          error: null
        })
        break
      case 'queue_left':
        set({
          queueStatus: 'idle',
          queuedPlayers: 0,
          playersRequired: 0,
          position: 0,
          error: null
        })
        break
      case 'match_found':
        set({
          queueStatus: 'matched',
          match: {
            matchId: event.matchId,
            mode: event.mode,
            teams: event.teams
          },
          error: null
        })
        break
      case 'error':
        set({
          ...(event.code === 'NOT_QUEUED' ? { queueStatus: 'idle' as const } : {}),
          error: event.message
        })
        break
      case 'pong':
        break
    }
  }

  return {
    connectionStatus: 'disconnected',
    queueStatus: 'idle',
    selectedMode: '5v5',
    queuedPlayers: 0,
    playersRequired: 0,
    position: 0,
    match: null,
    error: null,

    connect: async () => {
      if (!removeEventListener) {
        removeEventListener = window.api.matchmaking.onEvent(handleEvent)
      }

      set({ connectionStatus: 'connecting', error: null })
      try {
        await window.api.matchmaking.connect()
      } catch (error) {
        set({ connectionStatus: 'disconnected', error: readableError(error) })
      }
    },

    selectMode: (selectedMode) => set({ selectedMode, error: null }),

    joinQueue: async () => {
      const { connectionStatus, selectedMode } = get()
      if (connectionStatus !== 'ready') return

      set({ queueStatus: 'joining', error: null })
      try {
        await window.api.matchmaking.joinQueue(selectedMode)
      } catch (error) {
        set({ queueStatus: 'idle', error: readableError(error) })
      }
    },

    leaveQueue: async () => {
      set({ queueStatus: 'leaving', error: null })
      try {
        await window.api.matchmaking.leaveQueue()
      } catch (error) {
        set({ queueStatus: 'queued', error: readableError(error) })
      }
    },

    reset: () =>
      set({
        connectionStatus: 'disconnected',
        queueStatus: 'idle',
        selectedMode: '5v5',
        queuedPlayers: 0,
        playersRequired: 0,
        position: 0,
        match: null,
        error: null
      })
  }
})
