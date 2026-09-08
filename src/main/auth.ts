import type {
  AuthCredentials,
  AuthSession,
  RegistrationCredentials,
  SocialAuthProvider
} from '../shared/auth'
import { API_BASE_URL } from './config'
import { app, safeStorage, shell } from 'electron'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SOCIAL_POLL_INTERVAL_MS = 1_250
const SOCIAL_LOGIN_MAX_MS = 10 * 60 * 1000

interface BackendAuthResponse extends AuthSession {
  token: string
}

interface BackendErrorResponse {
  error?: unknown
  message?: unknown
}

interface BackendSocialStartResponse {
  authorizationUrl: string
  pollToken: string
  expiresAt: string
}

let sessionToken: string | null = null
let sessionUsername: string | null = null
const tokenPath = () => join(app.getPath('userData'), 'session-token.bin')
const persistToken = async (token: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    await writeFile(tokenPath(), safeStorage.encryptString(token), { mode: 0o600 })
  }
}

export const getSessionToken = (): string | null => sessionToken
export const getSessionUsername = (): string | null => sessionUsername
export const clearSessionToken = (): void => {
  sessionToken = null
  sessionUsername = null
  void unlink(tokenPath()).catch(() => undefined)
}

const validateCredentials = (
  value: unknown,
  action: 'login' | 'register'
): AuthCredentials | RegistrationCredentials => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid authentication request')
  }

  const { email, username, password } = value as Record<string, unknown>

  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    throw new Error('Username must be 3–32 characters using letters, numbers, or underscores')
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Password must be 8–128 characters')
  }

  if (action === 'register') {
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new Error('Enter a valid email address')
    }

    return { username, email, password }
  }

  return { username, password }
}

const validateSocialProvider = (value: unknown): SocialAuthProvider => {
  if (value !== 'google' && value !== 'facebook') {
    throw new Error('Invalid social login provider')
  }
  return value
}

const isAuthResponse = (value: unknown): value is BackendAuthResponse => {
  if (typeof value !== 'object' || value === null) return false

  const response = value as Record<string, unknown>
  const player = response.player

  return (
    typeof response.token === 'string' &&
    response.token.length > 0 &&
    typeof response.expiresAt === 'string' &&
    typeof player === 'object' &&
    player !== null &&
    typeof (player as Record<string, unknown>).id === 'string' &&
    typeof (player as Record<string, unknown>).username === 'string' &&
    typeof (player as Record<string, unknown>).email === 'string' &&
    typeof (player as Record<string, unknown>).mmr === 'number' &&
    typeof (player as Record<string, unknown>).points === 'number' &&
    typeof (player as Record<string, unknown>).createdAt === 'string'
  )
}

const isSocialStartResponse = (value: unknown): value is BackendSocialStartResponse => {
  if (typeof value !== 'object' || value === null) return false
  const response = value as Record<string, unknown>
  return (
    typeof response.authorizationUrl === 'string' &&
    typeof response.pollToken === 'string' &&
    response.pollToken.length >= 32 &&
    typeof response.expiresAt === 'string'
  )
}

const getErrorMessage = (value: unknown, status: number): string => {
  if (typeof value === 'object' && value !== null) {
    const { message } = value as BackendErrorResponse
    if (typeof message === 'string' && message.length > 0) return message
  }

  return `Authentication failed (${status})`
}

const acceptAuthResponse = async (body: BackendAuthResponse): Promise<AuthSession> => {
  sessionToken = body.token
  sessionUsername = body.player.username
  await persistToken(sessionToken)

  return {
    expiresAt: body.expiresAt,
    player: body.player
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export const authenticate = async (
  action: 'login' | 'register',
  untrustedCredentials: unknown
): Promise<AuthSession> => {
  const credentials = validateCredentials(untrustedCredentials, action)
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/auth/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
      signal: AbortSignal.timeout(10_000)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The authentication server did not respond in time')
    }

    throw new Error('Could not reach the authentication server')
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(getErrorMessage(body, response.status))
  }

  if (!isAuthResponse(body)) {
    throw new Error('The authentication server returned an invalid response')
  }

  return acceptAuthResponse(body)
}

export const authenticateWithSocial = async (
  untrustedProvider: unknown
): Promise<AuthSession> => {
  const provider = validateSocialProvider(untrustedProvider)
  const startResponse = await fetch(`${API_BASE_URL}/auth/social/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider }),
    signal: AbortSignal.timeout(10_000)
  }).catch(() => null)

  if (!startResponse) throw new Error('Could not reach the authentication server')

  const startBody: unknown = await startResponse.json().catch(() => null)
  if (!startResponse.ok) {
    throw new Error(getErrorMessage(startBody, startResponse.status))
  }
  if (!isSocialStartResponse(startBody)) {
    throw new Error('The authentication server returned an invalid social login response')
  }

  let authorizationUrl: URL
  try {
    authorizationUrl = new URL(startBody.authorizationUrl)
  } catch {
    throw new Error('The authentication server returned an invalid authorization URL')
  }
  if (
    authorizationUrl.protocol !== 'https:' ||
    authorizationUrl.username ||
    authorizationUrl.password
  ) {
    throw new Error('The authentication server returned an unsafe authorization URL')
  }

  await shell.openExternal(authorizationUrl.toString())

  const serverExpiry = Date.parse(startBody.expiresAt)
  const deadline = Math.min(
    Number.isFinite(serverExpiry) ? serverExpiry : Date.now() + SOCIAL_LOGIN_MAX_MS,
    Date.now() + SOCIAL_LOGIN_MAX_MS
  )

  while (Date.now() < deadline) {
    await delay(SOCIAL_POLL_INTERVAL_MS)

    const response = await fetch(`${API_BASE_URL}/auth/social/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pollToken: startBody.pollToken }),
      signal: AbortSignal.timeout(10_000)
    }).catch(() => null)

    // Keep waiting through a transient connectivity failure while the browser
    // flow may still be in progress.
    if (!response) continue

    const body: unknown = await response.json().catch(() => null)
    if (response.status === 202) continue
    if (!response.ok) throw new Error(getErrorMessage(body, response.status))
    if (!isAuthResponse(body)) {
      throw new Error('The authentication server returned an invalid social login result')
    }

    return acceptAuthResponse(body)
  }

  throw new Error('Social login timed out. Please try again.')
}

export const restoreSession = async (): Promise<AuthSession | null> => {
  if (!safeStorage.isEncryptionAvailable()) return null
  let token: string
  try {
    token = safeStorage.decryptString(await readFile(tokenPath()))
  } catch {
    return null
  }
  const response = await fetch(`${API_BASE_URL}/auth/session`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000)
  }).catch(() => null)
  // Keep the encrypted token when the backend is temporarily unreachable so a
  // later launch can retry restoration. Only discard it when the server
  // explicitly rejects the session.
  if (!response) return null
  if (!response.ok) {
    if (response.status !== 401) return null
    clearSessionToken()
    return null
  }
  const body: unknown = await response.json().catch(() => null)
  if (typeof body !== 'object' || body === null) return null
  if (!isAuthResponse({ ...(body as Record<string, unknown>), token })) return null
  const restored = body as AuthSession
  sessionToken = token
  sessionUsername = restored.player.username
  return { expiresAt: restored.expiresAt, player: restored.player }
}
