import { clearSessionToken, getSessionToken } from './auth'
import { matchmakingConnection } from './matchmaking'
import { resolvePreferredMatchmakingApiUrl } from './matchmaking-regions'
import type { DailyQuest, DailyQuestSnapshot } from '../shared/daily-quests'

const isQuest = (value: unknown): value is DailyQuest => {
  if (typeof value !== 'object' || value === null) return false
  const quest = value as Record<string, unknown>
  return (
    typeof quest.id === 'string' &&
    typeof quest.templateId === 'string' &&
    typeof quest.metric === 'string' &&
    typeof quest.title === 'string' &&
    typeof quest.target === 'number' &&
    typeof quest.progress === 'number' &&
    typeof quest.rewardPoints === 'number' &&
    typeof quest.completed === 'boolean'
  )
}

const isSnapshot = (value: unknown): value is DailyQuestSnapshot => {
  if (typeof value !== 'object' || value === null) return false
  const snapshot = value as Record<string, unknown>
  return (
    typeof snapshot.date === 'string' &&
    typeof snapshot.resetsAt === 'string' &&
    !Number.isNaN(Date.parse(snapshot.resetsAt)) &&
    typeof snapshot.points === 'number' &&
    Array.isArray(snapshot.quests) &&
    snapshot.quests.length <= 3 &&
    snapshot.quests.every(isQuest)
  )
}

export const getDailyQuests = async (): Promise<DailyQuestSnapshot> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in to load daily quests.')

  const baseUrl =
    matchmakingConnection.getActiveApiUrl() ?? (await resolvePreferredMatchmakingApiUrl())
  const response = await fetch(new URL('/daily-quests', `${baseUrl.replace(/\/$/, '')}/`), {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the daily quest server.')
  })

  const body: unknown = await response.json().catch(() => null)
  if (response.status === 401) {
    clearSessionToken()
    throw new Error('Your session expired. Sign in again.')
  }
  if (!response.ok || !isSnapshot(body)) {
    throw new Error('Could not load daily quests.')
  }
  return body
}
