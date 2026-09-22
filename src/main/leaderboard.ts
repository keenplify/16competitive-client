import { API_BASE_URL } from './config'
import { getSessionToken } from './auth'
import type { LeaderboardEntry, TopMmrLeaderboard } from '../shared/leaderboard'

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

const isCountryCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{2}$/.test(value)

const isEntry = (value: unknown): value is LeaderboardEntry => {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.rank === 'number' &&
    Number.isInteger(entry.rank) &&
    entry.rank > 0 &&
    typeof entry.playerId === 'string' &&
    /^[0-9a-f-]{36}$/i.test(entry.playerId) &&
    typeof entry.username === 'string' &&
    entry.username.length > 0 &&
    entry.username.length <= 80 &&
    (entry.flagCountryCode === null || isCountryCode(entry.flagCountryCode)) &&
    typeof entry.mmr === 'number' &&
    Number.isFinite(entry.mmr)
  )
}

const isTopMmrLeaderboard = (value: unknown): value is Omit<TopMmrLeaderboard, 'currentPlayer'> => {
  if (typeof value !== 'object' || value === null) return false
  const leaderboard = value as Record<string, unknown>
  return (
    isTimestamp(leaderboard.generatedAt) &&
    isTimestamp(leaderboard.refreshAt) &&
    Array.isArray(leaderboard.entries) &&
    leaderboard.entries.length <= 10 &&
    leaderboard.entries.every(isEntry)
  )
}

const getCurrentPlayerStanding = async (countryCode?: string): Promise<LeaderboardEntry | null> => {
  const token = getSessionToken()
  if (!token) return null

  const countryQuery = countryCode ? `?country=${encodeURIComponent(countryCode)}` : ''
  const response = await fetch(`${API_BASE_URL}/leaderboard/me${countryQuery}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => null)

  if (!response || response.status === 401 || response.status === 404) return null

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !isEntry(body)) return null
  return body
}

export const getTopMmrLeaderboard = async (countryCode?: string): Promise<TopMmrLeaderboard> => {
  if (countryCode !== undefined && !isCountryCode(countryCode)) {
    throw new Error('Invalid leaderboard country')
  }

  const countryQuery = countryCode ? `?country=${encodeURIComponent(countryCode)}` : ''
  const response = await fetch(`${API_BASE_URL}/leaderboard/top-mmr${countryQuery}`, {
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the matchmaking server')
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    console.error('[Leaderboard] request failed', { status: response.status, countryCode })
    throw new Error('Could not load the leaderboard')
  }
  if (!isTopMmrLeaderboard(body)) {
    throw new Error('The matchmaking server returned an invalid leaderboard')
  }

  const currentPlayer = await getCurrentPlayerStanding(countryCode)
  return { ...body, currentPlayer }
}
