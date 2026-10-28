import type { CommunityCard } from '../../../../shared/community-directory'
import { usePartnerBrandingStore } from '../partner-branding/partner-branding.store'
import { useCommunitiesStore } from './communities.store'

/** The community being browsed can differ from the player's membership. */
export function useDisplayedCommunity(): CommunityCard | null {
  const preferred = useCommunitiesStore((state) => state.preferredCommunity)
  const current = useCommunitiesStore((state) => state.currentCommunity)
  const viewed = useCommunitiesStore((state) => state.viewedCommunity)
  const currentCommunityId = useCommunitiesStore((state) => state.currentCommunityId)
  const canBypassLeaveRestriction = useCommunitiesStore((state) => state.canBypassLeaveRestriction)
  const branding = usePartnerBrandingStore((state) => state.branding)
  return branding?.allowOtherCommunities === false &&
    branding.partnerId === currentCommunityId &&
    !canBypassLeaveRestriction
    ? ([preferred, current, viewed].find((item) => item?.id === branding.partnerId) ?? null)
    : (viewed ?? current)
}
