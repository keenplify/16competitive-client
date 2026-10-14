import { invalidatePartnerServerCache } from './partner-servers'
import { communityChatRequest } from './community-chat'
import { getSessionToken } from './auth'
import {
  parseCommunityTransfer,
  parseCommunityDecision,
  parseServerLink,
  validateCommunityDecision,
  validateServerLinkCode
} from '../shared/community-membership'
export async function pendingCommunityTransfer() {
  const token = getSessionToken()
  if (!token) throw new Error('SESSION_CHANGED')
  if (getSessionToken() !== token) throw new Error('SESSION_CHANGED')
  return parseCommunityTransfer(
    await communityChatRequest('GET', undefined, '/partners/community/transfer')
  )
}
export async function decideCommunityTransfer(id: unknown, accept: unknown) {
  validateCommunityDecision(id, accept)
  const result = parseCommunityDecision(
    await communityChatRequest('POST', { requestId: id, accept }, '/partners/community/transfer')
  )
  if (result.transferred) invalidatePartnerServerCache()
  return result
}
export async function linkCommunityServer(code: unknown) {
  validateServerLinkCode(code)
  return parseServerLink(await communityChatRequest('POST', { code }, '/partners/plugin/link'))
}
