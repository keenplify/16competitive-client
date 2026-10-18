import { communityChatRequest } from './community-chat'
import { invalidatePartnerServerCache } from './partner-servers'
import {
  communityDirectoryPath,
  parseCommunityDirectory,
  validateCommunityJoin,
  parseCommunityJoin,
  parseCommunityLeave
} from '../shared/community-directory'
export async function listCommunities(query: unknown) {
  return parseCommunityDirectory(
    await communityChatRequest('GET', undefined, communityDirectoryPath(query))
  )
}
export async function joinCommunity(id: unknown, expectedCommunityId: unknown) {
  validateCommunityJoin(id, expectedCommunityId)
  const result = parseCommunityJoin(
    await communityChatRequest('POST', { expectedCommunityId }, `/partners/communities/${id}/join`)
  )
  if (result.communityId !== id) throw new Error('INVALID_COMMUNITY_JOIN')
  invalidatePartnerServerCache()
  return result
}

export async function leaveCommunity(expected: unknown) {
  validateCommunityJoin(expected, null)
  const result = parseCommunityLeave(
    await communityChatRequest(
      'POST',
      { expectedCommunityId: expected },
      '/partners/communities/leave'
    )
  )
  invalidatePartnerServerCache()
  return result
}
