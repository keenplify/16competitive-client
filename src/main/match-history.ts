import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import type {
  MatchHistoryEntry,
  MatchSummary,
  MatchSummaryPlayer,
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
    typeof entry.assists === 'number'
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
    typeof player.assists === 'number'
  )
}

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

const isPlayerProfile = (value: unknown): value is PlayerProfile => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.mmr === 'number' &&
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
