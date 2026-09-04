export const LEADERBOARD_CHANNELS = {
  getTopMmr: 'leaderboard:get-top-mmr'
} as const

export interface LeaderboardEntry {
  rank: number
  username: string
  mmr: number
}

export interface TopMmrLeaderboard {
  generatedAt: string
  refreshAt: string
  entries: LeaderboardEntry[]
}

export interface LeaderboardApi {
  getTopMmr(): Promise<TopMmrLeaderboard>
}
