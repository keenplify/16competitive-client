import { communityChatRequest } from './community-chat'
import { invalidatePartnerServerCache } from './partner-servers'
import {
  communityDirectoryPath,
  parseCommunityDirectory,
  validateCommunityJoin,
  parseCommunityJoin,
  parseCommunityLeave,
  parseCommunityOwnerSettings,
  validateCommunityUpdate,
  communityUpdateBody,
  validateServerImageUpload,
  parseServerImageUpload
} from '../shared/community-directory'
import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
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
export async function updateCommunity(input: unknown): Promise<{ saved: true }> {
  validateCommunityUpdate(input)
  await communityChatRequest('PUT', communityUpdateBody(input), '/partners/branding/settings')
  invalidatePartnerServerCache()
  return { saved: true }
}
export async function communityOwnerSettings() {
  return parseCommunityOwnerSettings(
    await communityChatRequest('GET', undefined, '/partners/branding/settings')
  )
}
export async function uploadCommunityServerImage(id: unknown, bytes: unknown) {
  validateServerImageUpload(id, bytes)
  const token = getSessionToken()
  if (!token) throw new Error('SESSION_CHANGED')
  const body = new FormData()
  body.set('file', new Blob([new Uint8Array(bytes as Uint8Array)]), 'server-image')
  const response = await fetch(new URL(`/partners/branding/servers/${id}/image`, API_BASE_URL), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body,
    signal: AbortSignal.timeout(30_000)
  })
  if (getSessionToken() !== token) throw new Error('SESSION_CHANGED')
  if (!response.ok) throw new Error('SERVER_IMAGE_UPLOAD_FAILED')
  invalidatePartnerServerCache()
  return parseServerImageUpload(await response.json())
}
