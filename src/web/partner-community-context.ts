import {
  communityDirectoryPath,
  parseCommunityDirectory,
  type CommunityDirectoryQuery,
  type CommunityDirectoryResult
} from '../shared/community-directory'
import { parsePartnerBranding } from '../shared/partner-branding'
import { requestJson, currentApiOrigin } from './browser-session'
import { getBrowserPartnerId } from './partner-attribution'

const authenticatedGet = (path: string): Promise<unknown> =>
  requestJson(path, { authenticated: true })

export async function loadBrowserCommunityDirectory(
  query: CommunityDirectoryQuery
): Promise<CommunityDirectoryResult> {
  const partnerId = getBrowserPartnerId()
  if (!partnerId)
    return parseCommunityDirectory(await authenticatedGet(communityDirectoryPath(query)))
  const { branding } = parsePartnerBranding(
    await authenticatedGet(`/partners/branding/public/${partnerId}`),
    currentApiOrigin()
  )
  if (!branding)
    return parseCommunityDirectory(await authenticatedGet(communityDirectoryPath(query)))
  if (branding.partnerId !== partnerId) throw new Error('INVALID_COMMUNITY')
  // Resolve the linked community directly, even when it is outside the first
  // directory page. This changes the viewed community, not account membership.
  const preferred = parseCommunityDirectory(
    await authenticatedGet(`/partners/communities?communityId=${encodeURIComponent(partnerId)}`)
  )
  const preferredCommunity =
    preferred.communities.find((community) => community.id === partnerId) ?? null
  if (!branding.allowOtherCommunities) return { ...preferred, preferredCommunity }
  const directory = parseCommunityDirectory(await authenticatedGet(communityDirectoryPath(query)))
  return { ...directory, preferredCommunity }
}
