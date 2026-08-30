import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import type { MatchHistoryEntry } from '../shared/match-history'

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
