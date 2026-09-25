import { getSessionToken } from './auth'
import { getMatchmakingNodes, resolvePreferredMatchmakingApiUrl } from './matchmaking-regions'
import type {
  CustomGameMember,
  CustomGameRoom,
  CustomGameSettings,
  CustomGameSettingsUpdate
} from '../shared/custom-games'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAP_PATTERN = /^[a-z0-9_]{1,64}$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isMember = (value: unknown): value is CustomGameMember =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.username === 'string' &&
  typeof value.mmr === 'number' &&
  typeof value.isBot === 'boolean' &&
  (value.team === 0 || value.team === 1 || value.team === 2)

const isRoom = (value: unknown): value is CustomGameRoom =>
  isObject(value) &&
  typeof value.id === 'string' &&
  UUID_PATTERN.test(value.id) &&
  typeof value.ownerId === 'string' &&
  typeof value.name === 'string' &&
  (value.mode === 'unrated' || value.mode === 'ffa') &&
  typeof value.mapId === 'string' &&
  MAP_PATTERN.test(value.mapId) &&
  ['WAITING', 'READY_CHECK', 'LIVE', 'FINISHED'].includes(String(value.state)) &&
  value.maxPlayers === 18 &&
  Number.isInteger(value.teamOneCapacity) &&
  Number(value.teamOneCapacity) >= 1 &&
  Number(value.teamOneCapacity) <= 8 &&
  Number.isInteger(value.teamTwoCapacity) &&
  Number(value.teamTwoCapacity) >= 1 &&
  Number(value.teamTwoCapacity) <= 8 &&
  typeof value.hasPassword === 'boolean' &&
  (value.matchId === null || typeof value.matchId === 'string') &&
  typeof value.createdAt === 'string' &&
  typeof value.hostNodeId === 'string' &&
  typeof value.region === 'string' &&
  typeof value.hostApiUrl === 'string' &&
  Array.isArray(value.members) &&
  value.members.length <= 18 &&
  value.members.every(isMember)

const validatePassword = (value: unknown, nullable = false): string | null | undefined => {
  if (value === undefined) return undefined
  if (nullable && value === null) return null
  if (typeof value !== 'string') throw new Error('Invalid room password')
  if (value.length > 0 && (value.length < 4 || value.length > 64)) {
    throw new Error('Password must be 4–64 characters')
  }
  return value
}

const validateSettings = (value: unknown): CustomGameSettings => {
  if (!isObject(value)) throw new Error('Invalid custom game settings')
  const { name: rawName, mode, mapId } = value
  if (typeof rawName !== 'string') throw new Error('Invalid room name')
  const name = rawName.trim()
  if (name.length < 3 || name.length > 48) throw new Error('Room name must be 3–48 characters')
  if (mode !== 'unrated' && mode !== 'ffa') throw new Error('Invalid custom game mode')
  if (typeof mapId !== 'string' || !MAP_PATTERN.test(mapId)) throw new Error('Invalid map')
  const password = validatePassword(value.password) as string | undefined
  return { name, mode, mapId, ...(password === undefined ? {} : { password }) }
}

const validateSettingsUpdate = (value: unknown): CustomGameSettingsUpdate => {
  if (!isObject(value)) throw new Error('Invalid custom game settings')
  const update: CustomGameSettingsUpdate = {}
  if (value.name !== undefined) {
    if (typeof value.name !== 'string') throw new Error('Invalid room name')
    const name = value.name.trim()
    if (name.length < 3 || name.length > 48) throw new Error('Room name must be 3–48 characters')
    update.name = name
  }
  if (value.mode !== undefined) {
    if (value.mode !== 'unrated' && value.mode !== 'ffa')
      throw new Error('Invalid custom game mode')
    update.mode = value.mode
  }
  if (value.mapId !== undefined) {
    if (typeof value.mapId !== 'string' || !MAP_PATTERN.test(value.mapId))
      throw new Error('Invalid map')
    update.mapId = value.mapId
  }
  const password = validatePassword(value.password, true)
  if (password !== undefined) update.password = password
  return update
}

const allowedApiUrl = async (requested?: string): Promise<string> => {
  if (!requested) return resolvePreferredMatchmakingApiUrl()
  const origin = new URL(requested).origin
  const nodes = await getMatchmakingNodes()
  if (!nodes.some((node) => node.available && new URL(node.publicApiUrl).origin === origin)) {
    throw new Error('The custom game server is unavailable')
  }
  return origin
}

const request = async (
  path: string,
  init: RequestInit = {},
  requestedApiUrl?: string
): Promise<unknown> => {
  const apiUrl = await allowedApiUrl(requestedApiUrl)
  return requestAtApiUrl(apiUrl, path, init)
}

const requestAtApiUrl = async (
  apiUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before managing a custom game')
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {})
    },
    signal: AbortSignal.timeout(10_000)
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      isObject(body) && typeof body.message === 'string'
        ? body.message
        : `Custom game request failed (${response.status})`
    )
  }
  return body
}

const roomFrom = (body: unknown, nullable = false): CustomGameRoom | null => {
  if (!isObject(body) || !(isRoom(body.room) || (nullable && body.room === null))) {
    throw new Error('The custom game server returned an invalid room')
  }
  return body.room as CustomGameRoom | null
}

const roomsFrom = (body: unknown): CustomGameRoom[] => {
  if (!isObject(body) || !Array.isArray(body.rooms) || !body.rooms.every(isRoom)) {
    throw new Error('The custom game server returned an invalid room list')
  }
  return body.rooms
}

export const listCustomGames = async (selectedNodeId?: unknown): Promise<CustomGameRoom[]> => {
  if (
    selectedNodeId !== undefined &&
    selectedNodeId !== null &&
    typeof selectedNodeId !== 'string'
  ) {
    throw new Error('Invalid custom game server')
  }

  const nodes = await getMatchmakingNodes()
  const availableNodes = nodes.filter((node) => node.available)
  const targetNodes =
    typeof selectedNodeId === 'string'
      ? availableNodes.filter((node) => node.id === selectedNodeId)
      : availableNodes

  if (targetNodes.length === 0) {
    throw new Error(
      typeof selectedNodeId === 'string'
        ? 'The selected custom game server is unavailable'
        : 'No custom game servers are available'
    )
  }

  const results = await Promise.allSettled(
    targetNodes.map(async (node) => {
      const apiUrl = new URL(node.publicApiUrl).origin
      return roomsFrom(await requestAtApiUrl(apiUrl, '/custom-games'))
    })
  )
  const successful = results.filter(
    (result): result is PromiseFulfilledResult<CustomGameRoom[]> => result.status === 'fulfilled'
  )
  if (successful.length === 0) {
    throw new Error('Could not load rooms from the selected custom game servers')
  }

  return [
    ...new Map(successful.flatMap(({ value }) => value).map((room) => [room.id, room])).values()
  ]
}

export const getMyCustomGame = async (hostApiUrl?: unknown): Promise<CustomGameRoom | null> =>
  roomFrom(
    await request(
      '/custom-games/mine',
      {},
      typeof hostApiUrl === 'string' ? hostApiUrl : undefined
    ),
    true
  )

export const createCustomGame = async (settings: unknown): Promise<CustomGameRoom> =>
  roomFrom(
    await request('/custom-games', {
      method: 'POST',
      body: JSON.stringify(validateSettings(settings))
    })
  )!

export const updateCustomGame = async (
  roomId: unknown,
  settings: unknown,
  hostApiUrl?: unknown
): Promise<CustomGameRoom> => {
  if (typeof roomId !== 'string' || !UUID_PATTERN.test(roomId)) throw new Error('Invalid room')
  return roomFrom(
    await request(
      `/custom-games/${roomId}`,
      { method: 'PATCH', body: JSON.stringify(validateSettingsUpdate(settings)) },
      typeof hostApiUrl === 'string' ? hostApiUrl : undefined
    )
  )!
}

const roomAction = async (
  roomId: unknown,
  suffix: string,
  init: RequestInit = {},
  hostApiUrl?: unknown
): Promise<CustomGameRoom | null> => {
  if (typeof roomId !== 'string' || !UUID_PATTERN.test(roomId)) throw new Error('Invalid room')
  return roomFrom(
    await request(
      `/custom-games/${roomId}${suffix}`,
      init,
      typeof hostApiUrl === 'string' ? hostApiUrl : undefined
    ),
    suffix === '/leave'
  )
}

export const joinCustomGame = (
  roomId: unknown,
  password?: unknown,
  host?: unknown
): Promise<CustomGameRoom> =>
  roomAction(
    roomId,
    '/join',
    {
      method: 'POST',
      body: JSON.stringify({ password: validatePassword(password) })
    },
    host
  ) as Promise<CustomGameRoom>
export const leaveCustomGame = (roomId: unknown, host?: unknown): Promise<CustomGameRoom | null> =>
  roomAction(roomId, '/leave', { method: 'POST' }, host)
export const startCustomGame = (roomId: unknown, host?: unknown): Promise<CustomGameRoom> =>
  roomAction(roomId, '/start', { method: 'POST' }, host) as Promise<CustomGameRoom>
export const addCustomGameBot = (roomId: unknown, host?: unknown): Promise<CustomGameRoom> =>
  roomAction(roomId, '/bots', { method: 'POST' }, host) as Promise<CustomGameRoom>
export const setCustomGameTeamCapacity = (
  roomId: unknown,
  team: unknown,
  capacity: unknown,
  host?: unknown
): Promise<CustomGameRoom> => {
  if (team !== 1 && team !== 2) throw new Error('Invalid custom game team')
  if (!Number.isInteger(capacity) || Number(capacity) < 1 || Number(capacity) > 8) {
    throw new Error('Invalid custom game capacity')
  }
  return roomAction(
    roomId,
    '/team-capacity',
    {
      method: 'PATCH',
      body: JSON.stringify({ team, capacity })
    },
    host
  ) as Promise<CustomGameRoom>
}
export const moveCustomGameMember = async (
  roomId: unknown,
  playerId: unknown,
  team: unknown,
  host?: unknown
): Promise<CustomGameRoom> => {
  if (typeof playerId !== 'string' || !UUID_PATTERN.test(playerId))
    throw new Error('Invalid player')
  if (team !== 0 && team !== 1 && team !== 2) throw new Error('Invalid custom game slot')
  return roomAction(
    roomId,
    `/members/${playerId}/team`,
    {
      method: 'PATCH',
      body: JSON.stringify({ team })
    },
    host
  ) as Promise<CustomGameRoom>
}
export const moveCustomGameServer = (
  roomId: unknown,
  targetNodeId: unknown,
  host?: unknown
): Promise<CustomGameRoom> => {
  if (typeof targetNodeId !== 'string' || targetNodeId.length < 1 || targetNodeId.length > 128) {
    throw new Error('Invalid destination server')
  }
  return roomAction(
    roomId,
    '/move',
    { method: 'POST', body: JSON.stringify({ targetNodeId }) },
    host
  ) as Promise<CustomGameRoom>
}
export const kickCustomGameMember = async (
  roomId: unknown,
  playerId: unknown,
  host?: unknown
): Promise<CustomGameRoom | null> => {
  if (typeof playerId !== 'string' || !UUID_PATTERN.test(playerId))
    throw new Error('Invalid player')
  return roomAction(roomId, `/members/${playerId}`, { method: 'DELETE' }, host)
}
