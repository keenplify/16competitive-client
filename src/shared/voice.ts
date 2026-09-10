export const VOICE_CHANNELS = {
  connect: 'voice:connect',
  disconnect: 'voice:disconnect',
  sync: 'voice:sync',
  signal: 'voice:signal',
  event: 'voice:event'
} as const

export type VoiceScope = 'party' | 'match_team'

export interface VoiceParticipant {
  id: string
  username: string
}

export interface VoiceRoom {
  scope: VoiceScope
  roomId: string
  participants: VoiceParticipant[]
}

export type VoiceSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | {
      type: 'ice'
      candidate: string
      sdpMid?: string | null
      sdpMLineIndex?: number | null
    }

export type VoiceEvent =
  | { type: 'connection_state'; state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' }
  | { type: 'voice_room'; room: VoiceRoom | null }
  | { type: 'voice_peer_available'; roomId: string; participant: VoiceParticipant }
  | { type: 'voice_peer_left'; roomId: string; playerId: string }
  | { type: 'voice_signal'; roomId: string; fromPlayerId: string; signal: VoiceSignal }
  | { type: 'error'; code: string; message: string }

export interface VoiceApi {
  connect(): Promise<void>
  disconnect(): Promise<void>
  sync(): Promise<void>
  signal(roomId: string, targetPlayerId: string, signal: VoiceSignal): Promise<void>
  onEvent(listener: (event: VoiceEvent) => void): () => void
}
