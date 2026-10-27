import type { MatchmakingMode } from './matchmaking'

export interface NativeHelperPresence {
  phase: 'lobby' | 'queue' | 'match' | 'game'
  mode: MatchmakingMode | null
  map: string | null
  partyId: string | null
  partySize: number
  joinSecret: string | null
  startedAt: number | null
}

export interface NativeHelperPresenceStatus {
  connected: boolean
  joinSecret: string | null
}
