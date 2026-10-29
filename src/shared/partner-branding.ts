import {
  parseCommunityBranding,
  type PartnerServer,
  type PartnerSocialLinks
} from './partner-community'
export const PARTNER_BRANDING_CHANNEL = 'partner-branding:get'
export const JOINED_BRANDING_CHANNEL = 'partner-branding:joined'

export interface PartnerAppIcon {
  pngUrl: string
  icoUrl: string
  smallUrl: string
  pngSha256: string
  icoSha256: string
  smallSha256: string
}
export interface PartnerBranding {
  partnerId: string
  desktopAppEnabled?: boolean
  appName?: string | null
  appIcon?: PartnerAppIcon | null
  launcherTheme?: 'latest' | 'vgui2'
  primaryColor: string
  secondaryColor: string
  tertiaryColor: string
  musicUrl?: string | null
  backgroundUrl: string | null
  backgroundKind: 'image' | 'video' | null
  loginBackgroundUrl: string | null
  loginBackgroundKind: 'image' | 'video' | null
  logoUrl: string | null
  showPapamoGamesLogo: boolean
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
  getJoined(): Promise<PartnerBrandingResponse>
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
  if (
    value.launcherTheme !== undefined &&
    value.launcherTheme !== 'latest' &&
    value.launcherTheme !== 'vgui2'
  ) {
    throw new Error('Invalid community launcher theme.')
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
  const musicUrl = value.musicUrl ?? null
  if (musicUrl !== null && typeof musicUrl !== 'string') throw new Error('Invalid community music.')
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
  if (value.showPapamoGamesLogo !== undefined && typeof value.showPapamoGamesLogo !== 'boolean')
    throw new Error('Invalid Papamo Games logo visibility.')
  for (const [mediaUrl, endpoint] of [
    [backgroundUrl, 'asset'],
    [loginBackgroundUrl, 'login-asset'],
    [logoUrl, 'logo'],
    [musicUrl, 'music']
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
  if (value.desktopAppEnabled !== undefined && typeof value.desktopAppEnabled !== 'boolean')
    throw new Error('Invalid desktop download setting.')
  const appName = value.appName
  if (
    appName != null &&
    (typeof appName !== 'string' ||
      !appName.length ||
      appName.length > 64 ||
      appName !== appName.trim() ||
      /[\p{Cc}\p{Cf}<>:"/\\|?*]/u.test(appName) ||
      /[. ]$/.test(appName) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(appName))
  )
    throw new Error('Invalid installed app name.')
  let appIcon: PartnerAppIcon | null = null
  if (value.appIcon != null) {
    if (typeof value.appIcon !== 'object') throw new Error('Invalid installed app icon.')
    const candidate = value.appIcon as Record<string, unknown>
    for (const [urlKey, hashKey, endpoint] of [
      ['pngUrl', 'pngSha256', 'app-icon'],
      ['icoUrl', 'icoSha256', 'app-icon.ico'],
      ['smallUrl', 'smallSha256', 'app-icon-192']
    ] as const) {
      const hash = candidate[hashKey],
        rawUrl = candidate[urlKey]
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || typeof rawUrl !== 'string')
        throw new Error('Invalid installed app icon.')
      const url = new URL(rawUrl),
        api = new URL(apiOrigin)
      if (
        url.origin !== api.origin ||
        (url.protocol !== 'https:' &&
          !(api.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(api.hostname))) ||
        url.pathname !== `/partners/branding/${value.partnerId}/${endpoint}` ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.get('v') !== hash ||
        [...url.searchParams.keys()].some((key) => key !== 'v')
      )
        throw new Error('Unapproved installed app icon URL.')
    }
    appIcon = candidate as unknown as PartnerAppIcon
  }
  return {
    branding: {
      ...parseCommunityBranding(value),
      ...(value.launcherTheme !== undefined
        ? { launcherTheme: value.launcherTheme as 'latest' | 'vgui2' }
        : {}),
      partnerId: value.partnerId,
      ...(value.desktopAppEnabled !== undefined
        ? { desktopAppEnabled: value.desktopAppEnabled as boolean }
        : {}),
      ...(value.appName !== undefined ? { appName: appName as string | null } : {}),
      ...(value.appIcon !== undefined ? { appIcon } : {}),
      primaryColor: value.primaryColor,
      secondaryColor: value.secondaryColor,
      tertiaryColor: value.tertiaryColor,
      ...(value.musicUrl !== undefined ? { musicUrl: musicUrl as string | null } : {}),
      backgroundUrl: backgroundUrl as string | null,
      backgroundKind: backgroundKind as 'image' | 'video' | null,
      loginBackgroundUrl: loginBackgroundUrl as string | null,
      loginBackgroundKind: loginBackgroundKind as 'image' | 'video' | null,
      logoUrl: logoUrl as string | null,
      showPapamoGamesLogo: (value.showPapamoGamesLogo as boolean | undefined) ?? true
    }
  }
}
