import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import type {
  MatchHistoryEntry,
  MatchSummary,
  MatchSummaryPlayer,
  MatchSurvey,
  MatchSurveySubmission,
  PendingMatchSurvey,
  PlayerProfile
} from '../shared/match-history'

const isEntry = (value: unknown): value is MatchHistoryEntry => {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.mapId === 'string' &&
    typeof entry.mode === 'string' &&
    typeof entry.winner === 'string' &&
    typeof entry.score === 'string' &&
    typeof entry.completedAt === 'string' &&
    typeof entry.team === 'string' &&
    (entry.result === 'win' || entry.result === 'loss') &&
    typeof entry.kills === 'number' &&
    typeof entry.deaths === 'number' &&
    typeof entry.assists === 'number' &&
    typeof entry.headshots === 'number' &&
    typeof entry.damage === 'number' &&
    typeof entry.headshotPercent === 'number' &&
    typeof entry.adr === 'number' &&
    isNullableInteger(entry.mmrBefore) &&
    isNullableInteger(entry.mmrAfter) &&
    isNullableInteger(entry.mmrChange)
  )
}

const isSummaryPlayer = (value: unknown): value is MatchSummaryPlayer => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.team === 'string' &&
    (player.result === 'win' || player.result === 'loss') &&
    typeof player.kills === 'number' &&
    typeof player.deaths === 'number' &&
    typeof player.assists === 'number' &&
    typeof player.headshots === 'number' &&
    typeof player.damage === 'number' &&
    typeof player.headshotPercent === 'number' &&
    typeof player.adr === 'number' &&
    isNullableInteger(player.mmrBefore) &&
    isNullableInteger(player.mmrAfter) &&
    isNullableInteger(player.mmrChange)
  )
}

const isNullableInteger = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isInteger(value))

const isMatchSummary = (value: unknown): value is MatchSummary => {
  if (typeof value !== 'object' || value === null) return false
  const summary = value as Record<string, unknown>
  return (
    typeof summary.id === 'string' &&
    typeof summary.mapId === 'string' &&
    typeof summary.mode === 'string' &&
    typeof summary.winner === 'string' &&
    typeof summary.score === 'string' &&
    typeof summary.completedAt === 'string' &&
    Array.isArray(summary.players) &&
    summary.players.every(isSummaryPlayer)
  )
}

const isMatchSurvey = (value: unknown): value is MatchSurvey => {
  if (typeof value !== 'object' || value === null) return false
  const survey = value as Record<string, unknown>
  return (
    typeof survey.funRating === 'number' &&
    Number.isInteger(survey.funRating) &&
    survey.funRating >= 1 &&
    survey.funRating <= 5 &&
    typeof survey.fairnessRating === 'number' &&
    Number.isInteger(survey.fairnessRating) &&
    survey.fairnessRating >= 1 &&
    survey.fairnessRating <= 5 &&
    typeof survey.createdAt === 'string' &&
    typeof survey.updatedAt === 'string'
  )
}

const isPendingMatchSurvey = (value: unknown): value is PendingMatchSurvey => {
  if (typeof value !== 'object' || value === null) return false
  const pending = value as Record<string, unknown>
  return (
    typeof pending.matchId === 'string' &&
    typeof pending.mapId === 'string' &&
    typeof pending.mapDisplayName === 'string' &&
    typeof pending.mode === 'string' &&
    (pending.completedAt === null || typeof pending.completedAt === 'string')
  )
}

const isPlayerProfile = (value: unknown): value is PlayerProfile => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.mmr === 'number' &&
    (player.flagCountryCode === null ||
      (typeof player.flagCountryCode === 'string' && /^[A-Z]{2}$/.test(player.flagCountryCode))) &&
    typeof player.wins === 'number' &&
    typeof player.losses === 'number' &&
    typeof player.kills === 'number' &&
    typeof player.deaths === 'number' &&
    typeof player.assists === 'number' &&
    typeof player.createdAt === 'string'
  )
}

export const getMatchHistory = async (): Promise<MatchHistoryEntry[]> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before viewing match history')
  const response = await fetch(`${API_BASE_URL}/profile/matches`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the matchmaking server')
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const serverError =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === 'string'
        ? (body as Record<string, unknown>).error
        : `HTTP ${response.status}`
    console.error('[MatchHistory] request failed', { status: response.status, serverError })
    throw new Error(
      serverError === 'UNAUTHORIZED'
        ? 'Your session expired. Sign in again.'
        : 'Could not load match history'
    )
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray((body as Record<string, unknown>).matches) ||
    !(body as { matches: unknown[] }).matches.every(isEntry)
  ) {
    throw new Error('The matchmaking server returned invalid match history')
  }
  return (body as { matches: MatchHistoryEntry[] }).matches
}

export const getMatchSummary = async (matchId: unknown): Promise<MatchSummary> => {
  if (typeof matchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(matchId)) {
    throw new Error('Invalid match ID')
  }
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before viewing a match summary')
  const response = await fetch(`${API_BASE_URL}/profile/matches/${matchId}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the matchmaking server')
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const serverError =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === 'string'
        ? (body as Record<string, unknown>).error
        : `HTTP ${response.status}`
    console.error('[MatchHistory] summary request failed', { status: response.status, serverError })
    throw new Error(
      serverError === 'UNAUTHORIZED'
        ? 'Your session expired. Sign in again.'
        : serverError === 'MATCH_NOT_FOUND'
          ? 'This match summary is unavailable.'
          : 'Could not load match summary'
    )
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !('match' in body) ||
    !isMatchSummary((body as Record<string, unknown>).match)
  ) {
    throw new Error('The matchmaking server returned an invalid match summary')
  }
  return (body as { match: MatchSummary }).match
}

export const getPlayerProfile = async (playerId: unknown): Promise<PlayerProfile> => {
  if (
    typeof playerId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerId)
  ) {
    throw new Error('Invalid player ID')
  }
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before viewing a player profile')
  const response = await fetch(`${API_BASE_URL}/profile/players/${playerId}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the matchmaking server')
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const serverError =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === 'string'
        ? (body as Record<string, unknown>).error
        : `HTTP ${response.status}`
    console.error('[MatchHistory] player profile request failed', {
      status: response.status,
      serverError
    })
    throw new Error(
      serverError === 'UNAUTHORIZED'
        ? 'Your session expired. Sign in again.'
        : serverError === 'PLAYER_NOT_FOUND'
          ? 'This player profile is unavailable.'
          : 'Could not load player profile'
    )
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !('player' in body) ||
    !isPlayerProfile((body as Record<string, unknown>).player)
  ) {
    throw new Error('The matchmaking server returned an invalid player profile')
  }
  return (body as { player: PlayerProfile }).player
}


export const getMatchSurvey = async (matchId: unknown): Promise<MatchSurvey | null> => {
  if (typeof matchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(matchId)) {
    throw new Error('Invalid match ID')
  }
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before rating a match')
  const response = await fetch(`${API_BASE_URL}/profile/matches/${matchId}/survey`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the matchmaking server')
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const serverError =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === 'string'
        ? (body as Record<string, unknown>).error
        : `HTTP ${response.status}`
    throw new Error(
      serverError === 'UNAUTHORIZED'
        ? 'Your session expired. Sign in again.'
        : serverError === 'MATCH_NOT_FOUND'
          ? 'This match is unavailable for feedback.'
          : 'Could not load match feedback'
    )
  }
  const survey =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).survey : null
  if (survey === null) return null
  if (!isMatchSurvey(survey)) throw new Error('The matchmaking server returned invalid feedback')
  return survey
}

export const submitMatchSurvey = async (
  matchId: unknown,
  funRating: unknown,
  fairnessRating: unknown
): Promise<MatchSurveySubmission> => {
  if (typeof matchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(matchId)) {
    throw new Error('Invalid match ID')
  }
  if (
    typeof funRating !== 'number' ||
    !Number.isInteger(funRating) ||
    funRating < 1 ||
    funRating > 5 ||
    typeof fairnessRating !== 'number' ||
    !Number.isInteger(fairnessRating) ||
    fairnessRating < 1 ||
    fairnessRating > 5
  ) {
    throw new Error('Choose both feedback ratings.')
  }
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before rating a match')
  const response = await fetch(`${API_BASE_URL}/profile/matches/${matchId}/survey`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ funRating, fairnessRating }),
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the matchmaking server')
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const serverError =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === 'string'
        ? (body as Record<string, unknown>).error
        : `HTTP ${response.status}`
    throw new Error(
      serverError === 'UNAUTHORIZED'
        ? 'Your session expired. Sign in again.'
        : serverError === 'MATCH_NOT_FOUND'
          ? 'This match is unavailable for feedback.'
          : 'Could not save match feedback'
    )
  }
  const envelope =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  const survey = envelope?.survey
  const pointsAwarded = envelope?.pointsAwarded
  if (
    !isMatchSurvey(survey) ||
    typeof pointsAwarded !== 'number' ||
    !Number.isInteger(pointsAwarded) ||
    pointsAwarded < 0
  ) {
    throw new Error('The matchmaking server returned invalid feedback')
  }
  return { survey, pointsAwarded }
}


export const getPendingMatchSurvey = async (): Promise<PendingMatchSurvey | null> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before viewing match feedback')
  const response = await fetch(`${API_BASE_URL}/profile/matches/pending-survey`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the matchmaking server')
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const serverError =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === 'string'
        ? (body as Record<string, unknown>).error
        : `HTTP ${response.status}`
    throw new Error(
      serverError === 'UNAUTHORIZED'
        ? 'Your session expired. Sign in again.'
        : 'Could not load pending match feedback'
    )
  }
  const match =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).match : null
  if (match === null) return null
  if (!isPendingMatchSurvey(match)) {
    throw new Error('The matchmaking server returned invalid pending feedback')
  }
  return match
}
