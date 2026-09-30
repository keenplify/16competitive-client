export const MATCH_HISTORY_CHANNELS = {
  get: 'match-history:get',
  getSummary: 'match-history:get-summary',
  getPlayerProfile: 'match-history:get-player-profile',
  getSurvey: 'match-history:get-survey',
  getPendingSurvey: 'match-history:get-pending-survey',
  submitSurvey: 'match-history:submit-survey'
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
  headshots: number
  damage: number
  headshotPercent: number
  adr: number
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
  headshots: number
  damage: number
  headshotPercent: number
  adr: number
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

export interface MatchSurvey {
  funRating: number
  fairnessRating: number
  createdAt: string
  updatedAt: string
}

export interface MatchSurveyStatus {
  eligible: boolean
  survey: MatchSurvey | null
}

export interface PendingMatchSurvey {
  matchId: string
  mapId: string
  mapDisplayName: string
  mode: string
  completedAt: string | null
}

export interface MatchSurveySubmission {
  survey: MatchSurvey
  pointsAwarded: number
}

export interface PlayerProfile {
  id: string
  username: string
  mmr: number
  flagCountryCode: string | null
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
  getSurvey(matchId: string): Promise<MatchSurveyStatus>
  getPendingSurvey(): Promise<PendingMatchSurvey | null>
  submitSurvey(
    matchId: string,
    funRating: number,
    fairnessRating: number
  ): Promise<MatchSurveySubmission>
}
