import type { PartnerBranding } from '../../../../shared/partner-branding'
import { DEFAULT_BGM_ID, type LauncherBgmId } from './audio.paths'
import type { BgmSelection } from './audio.store'

export function resolveCommunityMusic(
  selection: BgmSelection,
  playerId: string | null,
  brandingAccountId: string | null,
  branding: PartnerBranding | null
): { trackId: LauncherBgmId; musicUrl: string | null } {
  return {
    trackId: selection === 'automatic' ? DEFAULT_BGM_ID : selection,
    musicUrl:
      selection === 'automatic' && playerId && brandingAccountId === playerId && branding
        ? (branding.musicUrl ?? null)
        : null
  }
}
