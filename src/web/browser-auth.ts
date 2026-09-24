import type {
  AuthApi,
  AuthSession,
  SocialAuthProvider,
  SocialAuthResult,
  SocialConnections
} from '../shared/auth'
import {
  clearWebSessionToken,
  getWebSessionToken,
  requestJson,
  setWebSessionToken,
  webHandoffReady
} from './browser-session'

type AuthResponse = {
  token: string
  expiresAt: string
  player: AuthSession['player']
}

type UsernameStatus = Pick<
  AuthSession['player'],
  'requiresUsernameSetup' | 'usernameChangeAvailableAt'
>

const SOCIAL_TIMEOUT_MS = 10 * 60 * 1000
const SOCIAL_POLL_MS = 1250
const SESSION_CACHE_KEY = '16competitive.web.auth-session'

const readCachedSession = (): AuthSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (
      !parsed ||
      typeof parsed.expiresAt !== 'string' ||
      !parsed.player ||
      typeof parsed.player.id !== 'string' ||
      Date.parse(parsed.expiresAt) <= Date.now()
    ) {
      localStorage.removeItem(SESSION_CACHE_KEY)
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(SESSION_CACHE_KEY)
    return null
  }
}

const writeCachedSession = (session: AuthSession): void => {
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session))
  } catch {
    // Session cache is only a refresh fallback. The bearer token remains authoritative.
  }
}

const clearCachedSession = (): void => {
  localStorage.removeItem(SESSION_CACHE_KEY)
}
let activeSocial: { provider: SocialAuthProvider; url: string; expiresAt: number } | null = null

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const usernameStatus = async (): Promise<UsernameStatus> =>
  requestJson<UsernameStatus>('/auth/username/status', { authenticated: true })

type BrowserNavigator = Navigator & {
  deviceMemory?: number
  userAgentData?: {
    platform?: string
    getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>
  }
}

const trimTelemetryText = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

const browserPlatform = (userAgent: string, platformHint?: string): string => {
  const source = `${platformHint ?? ''} ${userAgent}`.toLowerCase()
  if (/iphone|ipad|ipod/.test(source)) return 'ios'
  if (source.includes('android')) return 'android'
  if (/windows|win32|win64/.test(source)) return 'win32'
  if (/macintosh|mac os|macintel/.test(source)) return 'darwin'
  if (/linux|x11/.test(source)) return 'linux'
  return 'web'
}

const browserArchitecture = (
  userAgent: string,
  highEntropy: Record<string, unknown>
): string => {
  const hintedArchitecture = trimTelemetryText(highEntropy.architecture, 24)
  const bitness = trimTelemetryText(highEntropy.bitness, 8)
  if (hintedArchitecture) {
    if (hintedArchitecture === 'x86' && bitness === '64') return 'x64'
    if (hintedArchitecture === 'arm' && bitness === '64') return 'arm64'
    return hintedArchitecture
  }

  if (/arm64|aarch64/i.test(userAgent)) return 'arm64'
  if (/wow64|win64|x86_64|x64|amd64/i.test(userAgent)) return 'x64'
  if (/i[3-6]86|x86/i.test(userAgent)) return 'x86'
  if (/arm/i.test(userAgent)) return 'arm'
  return 'unknown'
}

const browserOsRelease = (userAgent: string, platform: string): string => {
  const windows = userAgent.match(/Windows NT ([0-9.]+)/i)?.[1]
  if (windows) return `Windows NT ${windows}`

  const android = userAgent.match(/Android\s+([^;)]+)/i)?.[1]
  if (android) return `Android ${android.trim()}`

  const ios = userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS)\s+([0-9_]+)/i)?.[1]
  if (ios) return `iOS ${ios.replace(/_/g, '.')}`

  const mac = userAgent.match(/Mac OS X\s+([0-9_]+)/i)?.[1]
  if (mac) return `macOS ${mac.replace(/_/g, '.')}`

  if (platform === 'linux') return 'Linux'
  return trimTelemetryText(userAgent, 128) ?? 'Web browser'
}

const browserGpuDevices = (): string[] => {
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl') ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    if (!gl) return []

    const extension = gl.getExtension('WEBGL_debug_renderer_info')
    if (!extension) return []

    const renderer = trimTelemetryText(
      gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
      256
    )
    return renderer ? [renderer] : []
  } catch {
    return []
  }
}

const reportBrowserClientTelemetry = async (): Promise<void> => {
  try {
    const browserNavigator = navigator as BrowserNavigator
    const userAgent = navigator.userAgent
    let highEntropy: Record<string, unknown> = {}

    try {
      const getHighEntropyValues = browserNavigator.userAgentData?.getHighEntropyValues
      if (getHighEntropyValues) {
        highEntropy = await getHighEntropyValues([
          'architecture',
          'bitness',
          'platform',
          'platformVersion'
        ])
      }
    } catch {
      // Browser privacy settings may reject high-entropy client hints.
    }

    const hintedPlatform =
      trimTelemetryText(highEntropy.platform, 64) ??
      trimTelemetryText(browserNavigator.userAgentData?.platform, 64) ??
      trimTelemetryText(navigator.platform, 64)
    const platform = browserPlatform(userAgent, hintedPlatform)
    const platformVersion = trimTelemetryText(highEntropy.platformVersion, 96)
    const logicalCpuCount =
      Number.isInteger(navigator.hardwareConcurrency) && navigator.hardwareConcurrency > 0
        ? navigator.hardwareConcurrency
        : undefined
    const deviceMemoryGb = browserNavigator.deviceMemory
    const totalMemoryMb =
      typeof deviceMemoryGb === 'number' && Number.isFinite(deviceMemoryGb) && deviceMemoryGb > 0
        ? Math.max(1, Math.round(deviceMemoryGb * 1024))
        : undefined

    await requestJson('/auth/client-telemetry', {
      authenticated: true,
      timeoutMs: 7_500,
      clearOnUnauthorized: false,
      init: {
        method: 'POST',
        body: JSON.stringify({
          clientVersion: `web-${String(__SIXTEEN_COMPETITIVE_VERSION__).slice(0, 60)}`,
          platform,
          architecture: browserArchitecture(userAgent, highEntropy),
          osRelease: browserOsRelease(userAgent, platform),
          osVersion: trimTelemetryText(
            platformVersion ? `${platformVersion} · UA: ${userAgent}` : `UA: ${userAgent}`,
            256
          ),
          logicalCpuCount,
          totalMemoryMb,
          gpuDevices: browserGpuDevices()
        })
      }
    })
  } catch (error) {
    console.warn(
      'Could not report browser client telemetry:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

const acceptAuth = async (body: AuthResponse): Promise<AuthSession> => {
  setWebSessionToken(body.token)
  const status = await usernameStatus()
  const session = { expiresAt: body.expiresAt, player: { ...body.player, ...status } }
  writeCachedSession(session)
  void reportBrowserClientTelemetry()
  return session
}

const startPopup = (): Window | null => {
  const popup = window.open('about:blank', '_blank')
  if (popup) popup.opener = null
  return popup
}

const navigatePopup = (popup: Window | null, url: string): void => {
  if (popup && !popup.closed) popup.location.href = url
  else window.open(url, '_blank', 'noopener,noreferrer')
}

const pollSocial = async (
  endpoint: '/auth/social/complete' | '/auth/social/link/complete',
  pollToken: string,
  provider: SocialAuthProvider,
  authenticated = false
): Promise<SocialAuthResult | SocialConnections> => {
  const deadline = Date.now() + SOCIAL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await delay(SOCIAL_POLL_MS)
    const headers = new Headers({ 'content-type': 'application/json' })
    if (authenticated && getWebSessionToken()) {
      headers.set('authorization', `Bearer ${getWebSessionToken()}`)
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pollToken }),
      signal: AbortSignal.timeout(10_000)
    })
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null

    if (response.status === 202) {
      if (body?.requiresPassword === true && typeof body.email === 'string') {
        return {
          kind: 'password_required',
          pollToken,
          provider,
          email: body.email
        }
      }
      if (body?.requiresEmail === true) {
        return { kind: 'email_required', pollToken, provider }
      }
      continue
    }

    if (!response.ok || !body) {
      throw new Error(
        typeof body?.message === 'string'
          ? body.message
          : `Social login failed (${response.status})`
      )
    }
    if (endpoint === '/auth/social/link/complete') {
      return body as unknown as SocialConnections
    }
    if (typeof body.token === 'string') {
      return acceptAuth(body as unknown as AuthResponse)
    }
  }
  throw new Error('Social login timed out. Please try again.')
}

const beginSocial = async (
  provider: SocialAuthProvider,
  linking: boolean
): Promise<SocialAuthResult | SocialConnections> => {
  const popup = startPopup()
  try {
    const start = await requestJson<{
      authorizationUrl: string
      pollToken: string
      expiresAt: string
    }>(linking ? '/auth/social/link/start' : '/auth/social/start', {
      authenticated: linking,
      init: { method: 'POST', body: JSON.stringify({ provider }) }
    })
    const expiresAt = Math.min(
      Number.isFinite(Date.parse(start.expiresAt)) ? Date.parse(start.expiresAt) : Date.now() + SOCIAL_TIMEOUT_MS,
      Date.now() + SOCIAL_TIMEOUT_MS
    )
    activeSocial = { provider, url: start.authorizationUrl, expiresAt }
    navigatePopup(popup, start.authorizationUrl)
    const result = await pollSocial(
      linking ? '/auth/social/link/complete' : '/auth/social/complete',
      start.pollToken,
      provider,
      linking
    )
    if (popup && !popup.closed) popup.close()
    return result
  } catch (error) {
    popup?.close()
    throw error
  }
}

export const browserAuthApi: AuthApi = {
  async login(credentials) {
    const body = await requestJson<AuthResponse>('/auth/login', {
      init: { method: 'POST', body: JSON.stringify(credentials) }
    })
    return acceptAuth(body)
  },

  async register(credentials) {
    const body = await requestJson<AuthResponse>('/auth/register', {
      init: { method: 'POST', body: JSON.stringify(credentials) }
    })
    return acceptAuth(body)
  },

  async social(provider) {
    return beginSocial(provider, false) as Promise<SocialAuthResult>
  },

  async reopenSocial(provider) {
    const current = activeSocial
    if (!current || current.provider !== provider || current.expiresAt <= Date.now()) {
      throw new Error('This social login is no longer active. Please start it again.')
    }
    window.open(current.url, '_blank', 'noopener,noreferrer')
  },

  async completeSocial(provider, pollToken, email) {
    await requestJson('/auth/social/complete-email', {
      init: {
        method: 'POST',
        body: JSON.stringify({ pollToken, email: email.trim() })
      }
    })
    return pollSocial('/auth/social/complete', pollToken, provider, false) as Promise<SocialAuthResult>
  },

  async completeSocialPassword(pollToken, password) {
    const body = await requestJson<AuthResponse>('/auth/social/complete-password', {
      init: { method: 'POST', body: JSON.stringify({ pollToken, password }) }
    })
    return acceptAuth(body)
  },

  async getSocialConnections() {
    return requestJson<SocialConnections>('/auth/social/connections', { authenticated: true })
  },

  async connectSocial(provider) {
    return beginSocial(provider, true) as Promise<SocialConnections>
  },

  async checkUsername(username) {
    return requestJson('/auth/username/check', {
      authenticated: true,
      init: { method: 'POST', body: JSON.stringify({ username }) }
    })
  },

  async changeUsername(username) {
    return requestJson('/auth/username', {
      authenticated: true,
      init: { method: 'POST', body: JSON.stringify({ username }) }
    })
  },

  async changePassword(credentials) {
    return requestJson('/auth/password', {
      authenticated: true,
      init: { method: 'POST', body: JSON.stringify(credentials) }
    })
  },

  async changeFlagCountryCode(flagCountryCode) {
    return requestJson('/auth/flag', {
      authenticated: true,
      init: { method: 'POST', body: JSON.stringify({ flagCountryCode }) }
    })
  },

  async restore() {
    await webHandoffReady
    const token = getWebSessionToken()
    if (!token) {
      clearCachedSession()
      return null
    }

    const cached = readCachedSession()

    try {
      const body = await requestJson<Omit<AuthResponse, 'token'>>('/auth/session', {
        authenticated: true,
        timeoutMs: 10_000,
        clearOnUnauthorized: false
      })

      let status: UsernameStatus | null = null
      try {
        status = await usernameStatus()
      } catch {
        // A valid auth session must not be discarded because optional username
        // metadata could not be refreshed.
      }

      const session: AuthSession = {
        expiresAt: body.expiresAt,
        player: {
          ...body.player,
          requiresUsernameSetup:
            status?.requiresUsernameSetup ?? cached?.player.requiresUsernameSetup ?? false,
          usernameChangeAvailableAt:
            status?.usernameChangeAvailableAt ?? cached?.player.usernameChangeAvailableAt ?? null
        }
      }
      writeCachedSession(session)
      void reportBrowserClientTelemetry()
      return session
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        clearWebSessionToken()
        clearCachedSession()
        return null
      }

      return cached
    }
  },

  async logout() {
    const token = getWebSessionToken()
    try {
      if (token) {
        await requestJson('/auth/logout', {
          authenticated: true,
          clearOnUnauthorized: false,
          init: { method: 'POST' }
        })
      }
    } finally {
      clearWebSessionToken()
      clearCachedSession()
    }
  }
}
