import {
  MatchmakingEvent,
  MatchmakingMap,
  MatchmakingMode,
  QueuedPlayer
} from '../../../../shared/matchmaking'
import { create } from 'zustand'
import { usePartyStore } from '../party/party.store'

type ConnectionStatus = 'disconnected' | 'connecting' | 'reconnecting' | 'authenticating' | 'ready'
type QueueStatus =
  | 'idle'
  | 'joining'
  | 'queued'
  | 'leaving'
  | 'ready_check'
  | 'countdown'
  | 'starting_server'
  | 'server_ready'

interface FoundMatch {
  matchId: string
  mode: MatchmakingMode
  mapId: string
  teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
}
export interface CompletedMatch extends FoundMatch {
  winner: 1 | 2
  teamAScore: number
  teamBScore: number
  players: { id: string; username: string; kills: number; deaths: number; assists: number }[]
}

interface MatchmakingState {
  connectionStatus: ConnectionStatus
  queueStatus: QueueStatus
  selectedMode: MatchmakingMode
  maps: MatchmakingMap[]
  mapsStatus: 'idle' | 'loading' | 'ready' | 'error'
  selectedMapId: string | null
  queuedPlayers: number
  playersRequired: number
  position: number
  match: FoundMatch | null
  completedMatch: CompletedMatch | null
  readyDeadline: string | null
  acceptedPlayerIds: string[]
  readyPlayersRequired: number
  readyResponse: 'pending' | 'sending' | 'accepted' | 'declined'
  countdown: number | null
  connectionDetails: { host: string; port: number; password: string } | null
  gameExited: boolean
  error: string | null
  connect: () => Promise<void>
  loadMaps: () => Promise<void>
  selectMode: (mode: MatchmakingMode) => void
  selectMap: (mapId: string) => void
  joinQueue: () => Promise<void>
  leaveQueue: () => Promise<void>
  respondReady: (accepted: boolean) => Promise<void>
  reconnectGame: () => Promise<void>
  reset: () => void
  dismissCompletedMatch: () => void
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
        set({
          queueStatus: 'queued',
          selectedMode: event.mode,
          selectedMapId: event.mapId,
          error: null
        })
        break
      case 'queue_status':
        set({
          queueStatus: 'queued',
          selectedMode: event.mode,
          selectedMapId: event.mapId,
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
          match: {
            matchId: event.matchId,
            mode: event.mode,
            mapId: event.mapId,
            teams: event.teams
          },
          error: null
        })
        break
      case 'match_ready_check':
        set((state) => ({
          queueStatus: 'ready_check',
          readyDeadline: event.deadline,
          acceptedPlayerIds: event.acceptedPlayerIds,
          readyPlayersRequired: event.playersRequired,
          readyResponse: state.readyResponse === 'accepted' ? 'accepted' : 'pending',
          error: null
        }))
        break
      case 'match_ready_updated':
        set({
          acceptedPlayerIds: event.acceptedPlayerIds,
          readyPlayersRequired: event.playersRequired
        })
        break
      case 'match_countdown':
        set({ queueStatus: 'countdown', countdown: event.secondsRemaining, error: null })
        break
      case 'match_server_starting':
        set({ queueStatus: 'starting_server', countdown: 0, error: null })
        break
      case 'match_connect':
        set({
          queueStatus: 'server_ready',
          connectionDetails: {
            host: event.host,
            port: event.port,
            password: event.password
          },
          error: null
        })
        break
      case 'game_process_exited':
        set({ gameExited: true })
        break
      case 'match_finished':
        set((state) => ({
          queueStatus: 'idle',
          completedMatch: state.match
            ? {
                ...state.match,
                winner: event.winner,
                teamAScore: event.teamAScore,
                teamBScore: event.teamBScore,
                players: event.players
              }
            : null,
          match: null,
          connectionDetails: null,
          error: `Match finished: Team ${event.winner === 1 ? 'A' : 'B'} won ${event.teamAScore}-${event.teamBScore}.`
        }))
        break
      case 'match_cancelled':
        set({
          queueStatus: 'idle',
          match: null,
          readyDeadline: null,
          acceptedPlayerIds: [],
          readyPlayersRequired: 0,
          readyResponse: 'pending',
          countdown: null,
          connectionDetails: null,
          error: event.message
        })
        break
      case 'error':
        set({
          ...(event.code === 'NOT_QUEUED' ? { queueStatus: 'idle' as const } : {}),
          error: event.message
        })
        break
      case 'pong':
      case 'party_invitation_received':
      case 'party_updated':
      case 'party_disbanded':
      case 'party_presence_ping':
        break
    }
  }

  return {
    connectionStatus: 'disconnected',
    queueStatus: 'idle',
    selectedMode: '5v5',
    maps: [],
    mapsStatus: 'idle',
    selectedMapId: null,
    queuedPlayers: 0,
    playersRequired: 0,
    position: 0,
    match: null,
    completedMatch: null,
    readyDeadline: null,
    acceptedPlayerIds: [],
    readyPlayersRequired: 0,
    readyResponse: 'pending',
    countdown: null,
    connectionDetails: null,
    gameExited: false,
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

    loadMaps: async () => {
      if (get().mapsStatus === 'loading') return
      set({ mapsStatus: 'loading', error: null })
      try {
        const maps = await window.api.matchmaking.getMaps()
        const { selectedMapId, selectedMode } = get()
        const selectedMapIsAvailable = maps.some(
          (map) => map.id === selectedMapId && map.supportedModes.includes(selectedMode)
        )
        const defaultMap = maps.find((map) => map.supportedModes.includes(selectedMode))
        set({
          maps,
          mapsStatus: 'ready',
          selectedMapId: selectedMapIsAvailable ? selectedMapId : (defaultMap?.id ?? null)
        })
      } catch (error) {
        set({ mapsStatus: 'error', error: readableError(error) })
      }
    },

    selectMode: (selectedMode) => {
      const { maps, selectedMapId } = get()
      const selectedMapIsAvailable = maps.some(
        (map) => map.id === selectedMapId && map.supportedModes.includes(selectedMode)
      )
      set({
        selectedMode,
        selectedMapId: selectedMapIsAvailable
          ? selectedMapId
          : (maps.find((map) => map.supportedModes.includes(selectedMode))?.id ?? null),
        error: null
      })
    },

    selectMap: (selectedMapId) => {
      const { maps, selectedMode } = get()
      if (
        !maps.some((map) => map.id === selectedMapId && map.supportedModes.includes(selectedMode))
      ) {
        return
      }
      set({ selectedMapId, error: null })
    },

    joinQueue: async () => {
      const { connectionStatus, selectedMapId, selectedMode } = get()
      if (connectionStatus !== 'ready') return
      const partySize = usePartyStore.getState().party?.members.length ?? 1
      if (selectedMode === '3v3' && partySize > 3) {
        set({ error: '3v3 matchmaking supports parties of up to 3 players.' })
        return
      }
      const settings = await window.api.gameSettings.get().catch(() => null)
      if (!settings?.cs16ExecutablePath) {
        set({
          error: 'Choose and save your Counter-Strike executable in Settings before matchmaking.'
        })
        return
      }
      if (!selectedMapId) {
        set({ error: 'Select an available map before joining matchmaking.' })
        return
      }

      set({ queueStatus: 'joining', error: null })
      try {
        await window.api.matchmaking.joinQueue(selectedMode, selectedMapId)
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

    respondReady: async (accepted) => {
      const matchId = get().match?.matchId
      if (!matchId || get().readyResponse !== 'pending') return
      set({ readyResponse: 'sending', error: null })
      try {
        await window.api.matchmaking.respondReady(matchId, accepted)
        set({ readyResponse: accepted ? 'accepted' : 'declined' })
      } catch (error) {
        set({ readyResponse: 'pending', error: readableError(error) })
      }
    },

    reconnectGame: async () => {
      set({ error: null })
      try {
        await window.api.matchmaking.reconnectGame()
        set({ gameExited: false })
      } catch (error) {
        set({ error: readableError(error) })
      }
    },

    dismissCompletedMatch: () => set({ completedMatch: null, error: null }),

    reset: () =>
      set({
        connectionStatus: 'disconnected',
        queueStatus: 'idle',
        selectedMode: '5v5',
        maps: [],
        mapsStatus: 'idle',
        selectedMapId: null,
        queuedPlayers: 0,
        playersRequired: 0,
        position: 0,
        match: null,
        completedMatch: null,
        readyDeadline: null,
        acceptedPlayerIds: [],
        readyPlayersRequired: 0,
        readyResponse: 'pending',
        countdown: null,
        connectionDetails: null,
        gameExited: false,
        error: null
      })
  }
})
