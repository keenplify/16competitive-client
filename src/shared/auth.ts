export const AUTH_CHANNELS = {
  login: 'auth:login',
  register: 'auth:register',
  social: 'auth:social',
  socialReopen: 'auth:social-reopen',
  socialComplete: 'auth:social-complete',
  socialPasswordComplete: 'auth:social-password-complete',
  socialConnections: 'auth:social-connections',
  socialConnect: 'auth:social-connect',
  usernameCheck: 'auth:username-check',
  usernameChange: 'auth:username-change',
  passwordChange: 'auth:password-change',
  flagChange: 'auth:flag-change',
  logout: 'auth:logout',
  restore: 'auth:restore'
} as const

export type SocialAuthProvider = 'google' | 'facebook' | 'discord'

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
  flagCountryCode: string | null
  createdAt: string
  hasPassword: boolean
  requiresUsernameSetup: boolean
  usernameChangeAvailableAt: string | null
}

export interface AuthSession {
  expiresAt: string
  player: AuthPlayer
}

export interface SocialEmailRequired {
  kind: 'email_required'
  pollToken: string
  provider: SocialAuthProvider
}

export interface SocialPasswordRequired {
  kind: 'password_required'
  pollToken: string
  provider: SocialAuthProvider
  email: string
}

export type SocialAuthResult = AuthSession | SocialEmailRequired | SocialPasswordRequired

export interface UsernameAvailability {
  available: boolean
}

export interface UsernameChangeResult {
  username: string
  requiresUsernameSetup: boolean
  usernameChangeAvailableAt: string | null
}

export interface PasswordChangeCredentials {
  currentPassword?: string
  newPassword: string
}

export interface PasswordChangeResult {
  hasPassword: true
}

export interface FlagChangeResult {
  flagCountryCode: string | null
}

export interface SocialConnectionState {
  connected: boolean
  email: string | null
}

export interface SocialConnections {
  google: SocialConnectionState
  facebook: SocialConnectionState
  discord: SocialConnectionState
}

export interface AuthApi {
  login(credentials: AuthCredentials): Promise<AuthSession>
  register(credentials: RegistrationCredentials): Promise<AuthSession>
  social(provider: SocialAuthProvider): Promise<SocialAuthResult>
  reopenSocial(provider: SocialAuthProvider): Promise<void>
  completeSocial(
    provider: SocialAuthProvider,
    pollToken: string,
    email: string
  ): Promise<SocialAuthResult>
  completeSocialPassword(pollToken: string, password: string): Promise<AuthSession>
  getSocialConnections(): Promise<SocialConnections>
  connectSocial(provider: SocialAuthProvider): Promise<SocialConnections>
  checkUsername(username: string): Promise<UsernameAvailability>
  changeUsername(username: string): Promise<UsernameChangeResult>
  changePassword(credentials: PasswordChangeCredentials): Promise<PasswordChangeResult>
  changeFlagCountryCode(flagCountryCode: string | null): Promise<FlagChangeResult>
  restore(): Promise<AuthSession | null>
  logout(): Promise<void>
}
