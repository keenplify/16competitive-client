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
    ? resolveConfiguredCommunityLinks(branding, language)
    : [...communityLinks]

export const resolveConfiguredCommunityLinks = (
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
    : []

export function useConfiguredCommunityLinks(): { label: string; href: string }[] {
  const { language } = useTranslation()
  const branding = usePartnerBrandingStore((state) => state.branding)
  return resolveConfiguredCommunityLinks(branding, language)
}
export function useCommunityLinks(): { label: string; href: string }[] {
  const { language } = useTranslation()
  const branding = usePartnerBrandingStore((state) => state.branding)
  return resolveCommunityLinks(branding, language)
}

export function useDesktopAppUrl(): string | null {
  const branding = usePartnerBrandingStore((state) => state.branding)
  if (window.__SIXTEEN_COMPETITIVE_WEB__ !== true) return desktopAppUrl
  const disabled =
    document.querySelector<HTMLMetaElement>('meta[name="16c-desktop-downloads"]')?.content ===
    'disabled'
  if (disabled || branding?.desktopAppEnabled === false) return null
  const partnerId =
    document.querySelector<HTMLMetaElement>('meta[name="16c-partner-id"]')?.content ??
    branding?.partnerId
  if (!partnerId || !/^[a-f0-9-]{36}$/i.test(partnerId)) return desktopAppUrl
  const origin =
    document.querySelector<HTMLMetaElement>('meta[name="16c-api-origin"]')?.content ??
    window.location.origin
  const platform = /Linux/i.test(navigator.userAgent) ? 'linux' : 'windows'
  const url = new URL(`/partners/download/${platform}`, origin)
  url.searchParams.set('partnerId', partnerId)
  if (platform === 'linux')
    url.searchParams.set('arch', /aarch64|arm64/i.test(navigator.userAgent) ? 'arm64' : 'x64')
  return url.toString()
}

/** PWA installation does not grant desktop capabilities. */
export function useHideDesktopOnlyFeatures(): boolean {
  const appUrl = useDesktopAppUrl()
  return window.__SIXTEEN_COMPETITIVE_WEB__ === true && appUrl === null
}
