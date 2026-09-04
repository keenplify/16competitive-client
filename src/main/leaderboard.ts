import { API_BASE_URL } from './config'
import type { LeaderboardEntry, TopMmrLeaderboard } from '../shared/leaderboard'

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

const isEntry = (value: unknown): value is LeaderboardEntry => {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.rank === 'number' &&
    Number.isInteger(entry.rank) &&
    entry.rank > 0 &&
    typeof entry.username === 'string' &&
    entry.username.length > 0 &&
    entry.username.length <= 80 &&
    typeof entry.mmr === 'number' &&
    Number.isFinite(entry.mmr)
  )
}

const isTopMmrLeaderboard = (value: unknown): value is TopMmrLeaderboard => {
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

export const getTopMmrLeaderboard = async (): Promise<TopMmrLeaderboard> => {
  const response = await fetch(`${API_BASE_URL}/leaderboard/top-mmr`, {
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the matchmaking server')
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    console.error('[Leaderboard] request failed', { status: response.status })
    throw new Error('Could not load the leaderboard')
  }
  if (!isTopMmrLeaderboard(body)) {
    throw new Error('The matchmaking server returned an invalid leaderboard')
  }
  return body
}
