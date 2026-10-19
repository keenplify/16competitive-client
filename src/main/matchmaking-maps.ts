import { clearSessionToken, getSessionToken } from './auth'
import { matchmakingConnection } from './matchmaking'
import { resolveServiceApiUrl } from './matchmaking-regions'
import type { MatchmakingMapCatalog } from '../shared/matchmaking'
import { parseMatchmakingMapCatalog } from '../shared/matchmaking-map-catalog'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const getMatchmakingMaps = async (): Promise<MatchmakingMapCatalog> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before loading matchmaking maps')

  let response: Response
  try {
    const apiUrl = matchmakingConnection.getActiveApiUrl() ?? (await resolveServiceApiUrl())
    response = await fetch(`${apiUrl}/matchmaking/maps`, {
      headers: { Authorization: `Bearer ${token}` },
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
    if (response.status === 401) {
      clearSessionToken()
      throw new Error('MATCHMAKING_MAPS_UNAUTHORIZED')
    }
    const message = isObject(body) && typeof body.message === 'string' ? body.message : null
    throw new Error(message ?? `Could not load matchmaking maps (${response.status})`)
  }
  return parseMatchmakingMapCatalog(body)
}
