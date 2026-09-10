import { API_BASE_URL } from './config'
import { getSessionToken } from './auth'
import type {
  FriendPresence,
  FriendSearchResult,
  FriendsSnapshot,
  IncomingFriendRequest
} from '../shared/friends'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isPresence = (value: unknown): value is FriendPresence =>
  value === 'ONLINE' || value === 'IN_GAME' || value === 'OFFLINE'
const isPlayer = (value: unknown): boolean =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.username === 'string' &&
  typeof value.mmr === 'number'
const isFriend = (value: unknown): boolean =>
  isPlayer(value) && isPresence((value as Record<string, unknown>).presence)
const isRequest = (value: unknown): value is IncomingFriendRequest =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.createdAt === 'string' &&
  isPlayer(value.player)

const errorMessage = (body: unknown, status: number): string =>
  isObject(body) && typeof body.message === 'string'
    ? body.message
    : `Friends request failed (${status})`

const friendsRequest = async (path: string, init?: RequestInit): Promise<unknown> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before managing friends')
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {})
      },
      signal: AbortSignal.timeout(10_000)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The friends server did not respond in time')
    }
    throw new Error('Could not reach the friends server')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(body, response.status))
  return body
}

export const getFriends = async (): Promise<FriendsSnapshot> => {
  const body = await friendsRequest('/friends')
  if (
    !isObject(body) ||
    !Array.isArray(body.friends) ||
    !body.friends.every(isFriend) ||
    !Array.isArray(body.incomingRequests) ||
    !body.incomingRequests.every(isRequest)
  ) {
    throw new Error('The friends server returned an invalid list')
  }
  return body as unknown as FriendsSnapshot
}

export const searchPlayers = async (query: unknown): Promise<FriendSearchResult[]> => {
  if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 32) {
    throw new Error('Enter at least 2 characters to find a player')
  }
  const body = await friendsRequest(`/friends/search?query=${encodeURIComponent(query.trim())}`)
  if (
    !isObject(body) ||
    !Array.isArray(body.players) ||
    !body.players.every(
      (player) =>
        isFriend(player) &&
        ['NONE', 'OUTGOING', 'INCOMING', 'FRIEND'].includes(
          String((player as Record<string, unknown>).relationship)
        )
    )
  ) {
    throw new Error('The friends server returned invalid search results')
  }
  return body.players as FriendSearchResult[]
}

const validId = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error('A valid player ID is required')
  return value
}

export const sendFriendRequest = async (playerId: unknown): Promise<void> => {
  await friendsRequest('/friends/requests', {
    method: 'POST',
    body: JSON.stringify({ playerId: validId(playerId) })
  })
}

export const acceptFriendRequest = async (requestId: unknown): Promise<void> => {
  await friendsRequest(`/friends/requests/${validId(requestId)}/accept`, { method: 'POST' })
}

export const discardFriendRequest = async (requestId: unknown): Promise<void> => {
  await friendsRequest(`/friends/requests/${validId(requestId)}`, { method: 'DELETE' })
}

export const removeFriend = async (playerId: unknown): Promise<void> => {
  await friendsRequest(`/friends/${validId(playerId)}`, { method: 'DELETE' })
}
