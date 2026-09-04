export const MATCH_HISTORY_CHANNELS = {
  get: 'match-history:get',
  getSummary: 'match-history:get-summary',
  getPlayerProfile: 'match-history:get-player-profile'
} as const

export interface MatchHistoryEntry {
  id: string
  mapId: string
  mode: string
  winner: string
  score: string
  completedAt: string
  team: string
  result: 'win' | 'loss'
  kills: number
  deaths: number
  assists: number
  mmrBefore: number | null
  mmrAfter: number | null
  mmrChange: number | null
}

export interface MatchSummaryPlayer {
  id: string
  username: string
  team: string
  result: 'win' | 'loss'
  kills: number
  deaths: number
  assists: number
  mmrBefore: number | null
  mmrAfter: number | null
  mmrChange: number | null
}

export interface MatchSummary {
  id: string
  mapId: string
  mode: string
  winner: string
  score: string
  completedAt: string
  players: MatchSummaryPlayer[]
}

export interface PlayerProfile {
  id: string
  username: string
  mmr: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  createdAt: string
}

export interface MatchHistoryApi {
  get(): Promise<MatchHistoryEntry[]>
  getSummary(matchId: string): Promise<MatchSummary>
  getPlayerProfile(playerId: string): Promise<PlayerProfile>
}
