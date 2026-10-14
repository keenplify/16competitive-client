import { useTranslation, type SupportedLanguageCode } from '../i18n/i18n'
import { communityText } from '../partner-branding/community-copy'
import { usePartnerBrandingStore } from '../partner-branding/partner-branding.store'
import { partnerSocialLabels } from '../../../../shared/partner-community'
export const desktopAppUrl = 'https://papamo.dev/16competitive'

export const communityLinks = [
  { label: 'Discord', href: 'https://discord.gg/uZwKyf2EHp' },
  { label: 'Mastodon', href: 'https://mastodon.social/@16competitive' },
  { label: 'Ko-fi', href: 'https://ko-fi.com/16competitive' },
  { label: 'Facebook', href: 'https://www.facebook.com/1.6competitive' },
  { label: 'Instagram', href: 'https://www.instagram.com/1.6competitive' }
] as const

export const resolveCommunityLinks = (
  branding: ReturnType<typeof usePartnerBrandingStore.getState>['branding'],
  language: SupportedLanguageCode = 'en'
): { label: string; href: string }[] =>
  branding?.customSocialLinksEnabled
    ? Object.entries(partnerSocialLabels).flatMap(([key, label]) => {
        const href = branding.socialLinks[key as keyof typeof partnerSocialLabels]
        return href
          ? [{ label: key === 'website' ? communityText(language, 'website') : label, href }]
          : []
      })
    : [...communityLinks]
export function useCommunityLinks(): { label: string; href: string }[] {
  const { language } = useTranslation()
  const branding = usePartnerBrandingStore((state) => state.branding)
  return resolveCommunityLinks(branding, language)
}
