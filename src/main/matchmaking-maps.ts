import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import type { MatchmakingMap, MatchmakingMode } from '../shared/matchmaking'

const MAP_ID_PATTERN = /^[a-z0-9_]{1,64}$/
const isMode = (value: unknown): value is MatchmakingMode => value === '5v5' || value === 'casual'
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isPreviewUrl = (value: unknown): value is string | null => {
  if (value === null) return true
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const isMap = (value: unknown): value is MatchmakingMap =>
  isObject(value) &&
  typeof value.id === 'string' &&
  MAP_ID_PATTERN.test(value.id) &&
  typeof value.displayName === 'string' &&
  value.displayName.length > 0 &&
  value.displayName.length <= 80 &&
  typeof value.game === 'string' &&
  value.game.length > 0 &&
  value.game.length <= 32 &&
  isPreviewUrl(value.previewUrl) &&
  Array.isArray(value.supportedModes) &&
  value.supportedModes.length > 0 &&
  value.supportedModes.every(isMode)

export const getMatchmakingMaps = async (): Promise<MatchmakingMap[]> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before loading matchmaking maps')

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/matchmaking/maps`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The matchmaking server did not respond in time')
    }
    throw new Error('Could not reach the matchmaking server')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isObject(body) && typeof body.message === 'string' ? body.message : null
    throw new Error(message ?? `Could not load matchmaking maps (${response.status})`)
  }
  if (!isObject(body) || !Array.isArray(body.maps) || !body.maps.every(isMap)) {
    throw new Error('The matchmaking server returned invalid maps')
  }
  return body.maps
}
