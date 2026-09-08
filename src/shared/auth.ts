export const AUTH_CHANNELS = {
  login: 'auth:login',
  register: 'auth:register',
  social: 'auth:social',
  usernameCheck: 'auth:username-check',
  usernameChange: 'auth:username-change',
  logout: 'auth:logout',
  restore: 'auth:restore'
} as const

export type SocialAuthProvider = 'google' | 'facebook'

export interface AuthCredentials {
  username: string
  password: string
}

export interface RegistrationCredentials extends AuthCredentials {
  email: string
}

export interface AuthPlayer {
  id: string
  username: string
  email: string
  mmr: number
  points: number
  createdAt: string
  requiresUsernameSetup: boolean
  usernameChangeAvailableAt: string | null
}

export interface AuthSession {
  expiresAt: string
  player: AuthPlayer
}

export interface UsernameAvailability {
  available: boolean
}

export interface UsernameChangeResult {
  username: string
  requiresUsernameSetup: boolean
  usernameChangeAvailableAt: string | null
}

export interface AuthApi {
  login(credentials: AuthCredentials): Promise<AuthSession>
  register(credentials: RegistrationCredentials): Promise<AuthSession>
  social(provider: SocialAuthProvider): Promise<AuthSession>
  checkUsername(username: string): Promise<UsernameAvailability>
  changeUsername(username: string): Promise<UsernameChangeResult>
  restore(): Promise<AuthSession | null>
  logout(): Promise<void>
}
