export const LEADERBOARD_CHANNELS = {
  getTopMmr: 'leaderboard:get-top-mmr',
  getFeaturedLadder: 'leaderboard:get-featured-ladder'
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

export interface RankedLadderEntry extends LeaderboardEntry {
  gamesPlayed: number
  lastPlayedAt: string | null
}

export interface PublicRankedLadder {
  id: string
  slug: string
  title: string
  description: string | null
  rewardText: string | null
  startsAt: string
  endsAt: string
  minimumGames: number
  publicFrom: string
  publicUntil: string
}

export interface FeaturedRankedLadder {
  generatedAt: string
  refreshAt: string
  ladder: PublicRankedLadder | null
  entries: RankedLadderEntry[]
}

export interface LeaderboardApi {
  getTopMmr(continentOf?: string): Promise<TopMmrLeaderboard>
  getFeaturedLadder(): Promise<FeaturedRankedLadder>
}
