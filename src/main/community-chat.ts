import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import {
  parseCommunityHistory,
  parseCommunityMessage,
  parseCommunityMembers,
  communityMembersPath,
  type CommunityMembers,
  type CommunityChatHistory,
  type CommunityChatMessage
} from '../shared/partner-community'
export async function communityChatRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  path = '/partners/community/chat'
): Promise<T> {
  const token = getSessionToken()
  if (!token) throw new Error('SESSION_CHANGED')
  const response = await fetch(new URL(path, API_BASE_URL), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000)
  })
  if (getSessionToken() !== token) throw new Error('SESSION_CHANGED')
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'CHAT_RATE_LIMIT'
        : response.status === 403
          ? 'COMMUNITY_ACCESS_REQUIRED'
          : 'COMMUNITY_CHAT_FAILED'
    )
  return (await response.json()) as T
}
export async function communityMembers(
  page: unknown,
  communityId?: unknown
): Promise<CommunityMembers> {
  return parseCommunityMembers(
    await communityChatRequest('GET', undefined, communityMembersPath(page, communityId))
  )
}
export async function kickCommunityMember(
  communityId: unknown,
  playerId: unknown
): Promise<{ removed: true }> {
  if (
    typeof communityId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(communityId) ||
    typeof playerId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(playerId)
  )
    throw new Error('INVALID_COMMUNITY_MEMBER')
  const result = await communityChatRequest<{ removed?: unknown }>(
    'DELETE',
    undefined,
    `/admin/communities/${communityId}/members/${playerId}`
  )
  if (result?.removed !== true) throw new Error('COMMUNITY_KICK_FAILED')
  return { removed: true }
}
export const communityChatHistory = async (): Promise<CommunityChatHistory> =>
  parseCommunityHistory(await communityChatRequest('GET'))
export const sendCommunityChat = (id: unknown, message: unknown): Promise<CommunityChatMessage> => {
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    typeof message !== 'string' ||
    !message.trim() ||
    [...message].length > 300
  )
    throw new Error('INVALID_CHAT_MESSAGE')
  return communityChatRequest('POST', { communityId: id, message }).then(parseCommunityMessage)
}
