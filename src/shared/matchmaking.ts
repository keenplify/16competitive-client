export const MATCHMAKING_CHANNELS = {
  connect: 'matchmaking:connect',
  getNodes: 'matchmaking:get-nodes',
  selectNode: 'matchmaking:select-node',
  getPreferences: 'matchmaking:get-preferences',
  setAllowRegionExpansion: 'matchmaking:set-allow-region-expansion',
  joinQueue: 'matchmaking:join-queue',
  leaveQueue: 'matchmaking:leave-queue',
  getQueueStatus: 'matchmaking:get-queue-status',
  getMaps: 'matchmaking:get-maps',
  respondReady: 'matchmaking:respond-ready',
  reconnectGame: 'matchmaking:reconnect-game',
  event: 'matchmaking:event'
} as const

export type MatchmakingMode = '3v3' | '5v5'

export interface QueuedPlayer {
  id: string
  username: string
  mmr: number
}

export interface MatchmakingMap {
  id: string
  displayName: string
  game: string
  previewUrl: string | null
  supportedModes: MatchmakingMode[]
}

export interface MatchmakingNode {
  id: string
  region: string
  publicApiUrl: string
  capacity: number
  activeConnections: number
  activeMatches: number
  available: boolean
}

export interface MatchmakingPreferences {
  selectedNodeId: string | null
  allowRegionExpansion: boolean
}

export type PartyChatNotificationCode =
  | 'MEMBER_CONNECTED'
  | 'MEMBER_DISCONNECTED'
  | 'MEMBER_RECONNECTED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'MEMBER_INACTIVE'
  | 'PARTY_DISBANDED'
  | 'INVITATION_SENT'
  | 'INVITATION_DECLINED'
  | 'QUEUE_JOINED'
  | 'QUEUE_LEFT'
  | 'MATCH_FOUND'
  | 'MATCH_READY'
  | 'MATCH_COUNTDOWN'
  | 'MATCH_SERVER'
  | 'MATCH_CANCELLED'

export type PartyChatEvent =
  | {
      type: 'party_chat_message'
      id: string
      partyId: string
      sender: { id: string; username: string }
      message: string
      sentAt: string
    }
  | {
      type: 'party_chat_notification'
      id: string
      partyId: string
      code: PartyChatNotificationCode
      message: string
      sentAt: string
    }

export type MatchmakingServerMessage =
  | { type: 'connected'; authenticated: false }
  | { type: 'authenticated'; player: QueuedPlayer }
  | {
      type: 'queue_joined'
      mode: MatchmakingMode
      mapId: string
      region: string
      allowRegionExpansion: boolean
    }
  | {
      type: 'queue_status'
      mode: MatchmakingMode
      mapId: string
      queuedPlayers: number
      playersRequired: number
      position: number
      region: string
      allowRegionExpansion: boolean
    }
  | { type: 'queue_left'; mode: MatchmakingMode; mapId: string }
  | { type: 'party_invitation_received' }
  | { type: 'party_updated' }
  | { type: 'party_disbanded' }
  | { type: 'party_presence_ping'; nonce: string }
  | PartyChatEvent
  | {
      type: 'match_found'
      matchId: string
      mode: MatchmakingMode
      mapId: string
      region: string
      hostApiUrl: string
      teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
    }
  | {
      type: 'match_ready_check'
      matchId: string
      deadline: string
      acceptedPlayerIds: string[]
      playersRequired: number
    }
  | {
      type: 'match_ready_updated'
      matchId: string
      acceptedPlayerIds: string[]
      playersRequired: number
    }
  | { type: 'match_countdown'; matchId: string; secondsRemaining: number }
  | { type: 'match_server_starting'; matchId: string }
  | {
      type: 'match_connect'
      matchId: string
      host: string
      port: number
      password: string
      joinToken: string
    }
  | {
      type: 'match_cancelled'
      matchId: string
      reason: 'PLAYER_DECLINED' | 'PLAYER_NOT_READY' | 'SERVER_START_FAILED'
      message: string
    }
  | {
      type: 'match_finished'
      matchId: string
      mode: MatchmakingMode
      mapId: string
      teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
      winner: 1 | 2
      teamAScore: number
      teamBScore: number
      players: { id: string; username: string; kills: number; deaths: number; assists: number }[]
    }
  | { type: 'game_process_exited'; matchId: string; code: number | null; signal: string | null }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' }

export type MatchmakingEvent =
  | MatchmakingServerMessage
  | { type: 'connection_endpoint'; apiUrl: string | null; websocketUrl: string }
  | {
      type: 'connection_state'
      state: 'connecting' | 'reconnecting' | 'disconnected' | 'handoff'
    }

export interface MatchmakingApi {
  connect(): Promise<void>
  getNodes(): Promise<MatchmakingNode[]>
  selectNode(nodeId: string | null): Promise<MatchmakingPreferences>
  getPreferences(): Promise<MatchmakingPreferences>
  setAllowRegionExpansion(value: boolean): Promise<MatchmakingPreferences>
  joinQueue(mode: MatchmakingMode, mapId: string, allowRegionExpansion: boolean): Promise<void>
  leaveQueue(): Promise<void>
  getQueueStatus(): Promise<void>
  getMaps(): Promise<MatchmakingMap[]>
  respondReady(matchId: string, accepted: boolean): Promise<void>
  reconnectGame(): Promise<void>
  onEvent(listener: (event: MatchmakingEvent) => void): () => void
}
