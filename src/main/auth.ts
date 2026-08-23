import type { AuthCredentials, AuthSession, RegistrationCredentials } from '../shared/auth'
import { API_BASE_URL } from './config'

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface BackendAuthResponse extends AuthSession {
  token: string
}

interface BackendErrorResponse {
  error?: unknown
  message?: unknown
}

let sessionToken: string | null = null

export const getSessionToken = (): string | null => sessionToken
export const clearSessionToken = (): void => {
  sessionToken = null
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
    typeof (player as Record<string, unknown>).createdAt === 'string'
  )
}

const getErrorMessage = (value: unknown, status: number): string => {
  if (typeof value === 'object' && value !== null) {
    const { message } = value as BackendErrorResponse
    if (typeof message === 'string' && message.length > 0) return message
  }

  return `Authentication failed (${status})`
}

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

  sessionToken = body.token

  return {
    expiresAt: body.expiresAt,
    player: body.player
  }
}
