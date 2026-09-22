export const LEADERBOARD_CHANNELS = {
  getTopMmr: 'leaderboard:get-top-mmr'
} as const

export interface LeaderboardEntry {
  rank: number
  playerId: string
  username: string
  flagCountryCode: string | null
  mmr: number
}

export interface TopMmrLeaderboard {
  generatedAt: string
  refreshAt: string
  entries: LeaderboardEntry[]
  currentPlayer: LeaderboardEntry | null
}

export interface LeaderboardApi {
  getTopMmr(countryCode?: string): Promise<TopMmrLeaderboard>
}
