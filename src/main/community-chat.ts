import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import {
  parseCommunityHistory,
  parseCommunityMessage,
  parseCommunityMembers,
  type CommunityMembers,
  type CommunityChatHistory,
  type CommunityChatMessage
} from '../shared/partner-community'
export async function communityChatRequest<T>(
  method: 'GET' | 'POST' | 'PUT',
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
export async function communityMembers(page: unknown): Promise<CommunityMembers> {
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 10000)
    throw new Error('INVALID_COMMUNITY_PAGE')
  return parseCommunityMembers(
    await communityChatRequest('GET', undefined, `/partners/community/members?page=${page}`)
  )
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
