export const MATCHMAKING_CHANNELS = {
  connect: 'matchmaking:connect',
  joinQueue: 'matchmaking:join-queue',
  leaveQueue: 'matchmaking:leave-queue',
  getQueueStatus: 'matchmaking:get-queue-status',
  event: 'matchmaking:event'
} as const

export type MatchmakingMode = '3v3' | '5v5'

export interface QueuedPlayer {
  id: string
  username: string
  mmr: number
}

export type MatchmakingServerMessage =
  | { type: 'connected'; authenticated: false }
  | { type: 'authenticated'; player: QueuedPlayer }
  | { type: 'queue_joined'; mode: MatchmakingMode }
  | {
      type: 'queue_status'
      mode: MatchmakingMode
      queuedPlayers: number
      playersRequired: number
      position: number
    }
  | { type: 'queue_left'; mode: MatchmakingMode }
  | {
      type: 'match_found'
      matchId: string
      mode: MatchmakingMode
      teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
    }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' }

export type MatchmakingEvent =
  | MatchmakingServerMessage
  | {
      type: 'connection_state'
      state: 'connecting' | 'reconnecting' | 'disconnected'
    }

export interface MatchmakingApi {
  connect(): Promise<void>
  joinQueue(mode: MatchmakingMode): Promise<void>
  leaveQueue(): Promise<void>
  getQueueStatus(): Promise<void>
  onEvent(listener: (event: MatchmakingEvent) => void): () => void
}
