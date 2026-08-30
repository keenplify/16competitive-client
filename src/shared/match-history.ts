export const MATCH_HISTORY_CHANNELS = { get: 'match-history:get' } as const

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
}

export interface MatchHistoryApi {
  get(): Promise<MatchHistoryEntry[]>
}
