import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import type { MatchmakingNode, MatchmakingPreferences } from '../shared/matchmaking'

const preferencesPath = (): string => join(app.getPath('userData'), 'matchmaking-preferences.json')

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isApiUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}

const isNode = (value: unknown): value is MatchmakingNode =>
  isObject(value) &&
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  value.id.length <= 80 &&
  typeof value.region === 'string' &&
  value.region.length > 0 &&
  value.region.length <= 32 &&
  isApiUrl(value.publicApiUrl) &&
  typeof value.capacity === 'number' &&
  Number.isFinite(value.capacity) &&
  typeof value.activeConnections === 'number' &&
  Number.isFinite(value.activeConnections) &&
  typeof value.activeMatches === 'number' &&
  Number.isFinite(value.activeMatches) &&
  typeof value.available === 'boolean'

export const getMatchmakingPreferences = async (): Promise<MatchmakingPreferences> => {
  try {
    const value: unknown = JSON.parse(await readFile(preferencesPath(), 'utf8'))
    if (!isObject(value)) throw new Error('Invalid preferences')
    return {
      selectedNodeId: typeof value.selectedNodeId === 'string' ? value.selectedNodeId : null,
      allowRegionExpansion:
        typeof value.allowRegionExpansion === 'boolean' ? value.allowRegionExpansion : true
    }
  } catch {
    return { selectedNodeId: null, allowRegionExpansion: true }
  }
}

export const saveMatchmakingPreferences = async (
  update: Partial<MatchmakingPreferences>
): Promise<MatchmakingPreferences> => {
  const preferences = { ...(await getMatchmakingPreferences()), ...update }
  const destination = preferencesPath()
  const temporary = `${destination}.tmp`
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, destination)
  return preferences
}

export const getMatchmakingNodes = async (): Promise<MatchmakingNode[]> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before loading regions')
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/nodes`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    throw new Error('Could not reach the regional matchmaking service')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !isObject(body) || !Array.isArray(body.nodes) || !body.nodes.every(isNode)) {
    throw new Error('The regional matchmaking service returned invalid nodes')
  }
  return body.nodes
}

export const toMatchmakingWsUrl = (apiUrl: string): string => {
  if (!isApiUrl(apiUrl)) throw new Error('Invalid regional matchmaking API URL')
  const url = new URL(apiUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/matchmaking/ws'
  url.search = ''
  url.hash = ''
  return url.toString()
}
