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
let activeSocial: { provider: SocialAuthProvider; url: string; expiresAt: number } | null = null

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const usernameStatus = async (): Promise<UsernameStatus> =>
  requestJson<UsernameStatus>('/auth/username/status', { authenticated: true })

const acceptAuth = async (body: AuthResponse): Promise<AuthSession> => {
  setWebSessionToken(body.token)
  const status = await usernameStatus()
  return { expiresAt: body.expiresAt, player: { ...body.player, ...status } }
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
    try {
      const body = await requestJson<Record<string, unknown>>(endpoint, {
        authenticated,
        clearOnUnauthorized: false,
        init: {
          method: 'POST',
          body: JSON.stringify({ pollToken })
        }
      })
      if (endpoint === '/auth/social/link/complete') return body as unknown as SocialConnections
      if (typeof body.token === 'string') return acceptAuth(body as unknown as AuthResponse)
      continue
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      if (status === 202) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(authenticated && getWebSessionToken()
              ? { authorization: `Bearer ${getWebSessionToken()}` }
              : {})
          },
          body: JSON.stringify({ pollToken })
        })
        const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
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
      throw error
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
    return pollSocial(
      linking ? '/auth/social/link/complete' : '/auth/social/complete',
      start.pollToken,
      provider,
      linking
    )
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
    if (!token) return null
    try {
      const body = await requestJson<Omit<AuthResponse, 'token'>>('/auth/session', {
        authenticated: true,
        timeoutMs: 5000
      })
      const status = await usernameStatus()
      return { expiresAt: body.expiresAt, player: { ...body.player, ...status } }
    } catch {
      return null
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
    }
  }
}
