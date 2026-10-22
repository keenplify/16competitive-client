import {
  parseCommunityBranding,
  type PartnerServer,
  type PartnerSocialLinks
} from './partner-community'
export const PARTNER_BRANDING_CHANNEL = 'partner-branding:get'

export interface PartnerBranding {
  partnerId: string
  primaryColor: string
  secondaryColor: string
  tertiaryColor: string
  backgroundUrl: string | null
  backgroundKind: 'image' | 'video' | null
  loginBackgroundUrl: string | null
  loginBackgroundKind: 'image' | 'video' | null
  logoUrl: string | null
  communityName: string | null
  allowOtherCommunities: boolean
  customSocialLinksEnabled: boolean
  socialLinks: PartnerSocialLinks
  servers: PartnerServer[]
}

export interface PartnerBrandingResponse {
  branding: PartnerBranding | null
}

export interface PartnerBrandingApi {
  get(): Promise<PartnerBrandingResponse>
}

const colorPattern = /^#[0-9a-fA-F]{6}$/
const partnerIdPattern = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/

export const parsePartnerBranding = (
  input: unknown,
  apiOrigin: string
): PartnerBrandingResponse => {
  if (!input || typeof input !== 'object' || !('branding' in input)) {
    throw new Error('Invalid partner branding response.')
  }
  const branding = input.branding
  if (branding === null) return { branding: null }
  if (!branding || typeof branding !== 'object') {
    throw new Error('Invalid partner branding response.')
  }
  const value = branding as Record<string, unknown>
  if (
    typeof value.partnerId !== 'string' ||
    !partnerIdPattern.test(value.partnerId) ||
    typeof value.primaryColor !== 'string' ||
    !colorPattern.test(value.primaryColor) ||
    typeof value.secondaryColor !== 'string' ||
    !colorPattern.test(value.secondaryColor) ||
    typeof value.tertiaryColor !== 'string' ||
    !colorPattern.test(value.tertiaryColor)
  ) {
    throw new Error('Invalid partner branding palette.')
  }
  const backgroundKind = value.backgroundKind
  const backgroundUrl = value.backgroundUrl
  if (
    (backgroundKind !== null && backgroundKind !== 'image' && backgroundKind !== 'video') ||
    (backgroundUrl !== null && typeof backgroundUrl !== 'string') ||
    (backgroundKind === null) !== (backgroundUrl === null)
  ) {
    throw new Error('Invalid partner background.')
  }
  const logoUrl = value.logoUrl ?? null
  const loginBackgroundKind = value.loginBackgroundKind ?? null
  const loginBackgroundUrl = value.loginBackgroundUrl ?? null
  if (
    (loginBackgroundKind !== null &&
      loginBackgroundKind !== 'image' &&
      loginBackgroundKind !== 'video') ||
    (loginBackgroundUrl !== null && typeof loginBackgroundUrl !== 'string') ||
    (loginBackgroundKind === null) !== (loginBackgroundUrl === null)
  )
    throw new Error('Invalid partner login background.')
  if (logoUrl !== null && typeof logoUrl !== 'string') throw new Error('Invalid partner logo.')
  for (const [mediaUrl, endpoint] of [
    [backgroundUrl, 'asset'],
    [loginBackgroundUrl, 'login-asset'],
    [logoUrl, 'logo']
  ] as const) {
    if (typeof mediaUrl !== 'string') continue
    let url: URL
    try {
      url = new URL(mediaUrl)
    } catch {
      throw new Error('Invalid partner background URL.')
    }
    const api = new URL(apiOrigin)
    const localDevelopment =
      api.protocol === 'http:' && (api.hostname === 'localhost' || api.hostname === '127.0.0.1')
    if (
      url.origin !== api.origin ||
      (url.protocol !== 'https:' && !localDevelopment) ||
      url.pathname !== `/partners/branding/${value.partnerId}/${endpoint}` ||
      url.username ||
      url.password ||
      url.hash ||
      !url.searchParams.get('v') ||
      [...url.searchParams.keys()].some((key) => key !== 'v')
    ) {
      throw new Error('Unapproved partner background URL.')
    }
  }
  return {
    branding: {
      ...parseCommunityBranding(value),
      partnerId: value.partnerId,
      primaryColor: value.primaryColor,
      secondaryColor: value.secondaryColor,
      tertiaryColor: value.tertiaryColor,
      backgroundUrl: backgroundUrl as string | null,
      backgroundKind: backgroundKind as 'image' | 'video' | null,
      loginBackgroundUrl: loginBackgroundUrl as string | null,
      loginBackgroundKind: loginBackgroundKind as 'image' | 'video' | null,
      logoUrl: logoUrl as string | null
    }
  }
}
