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
  referralStatus: 'auth:referral-status',
  referralClaim: 'auth:referral-claim',
  passwordChange: 'auth:password-change',
  flagChange: 'auth:flag-change',
  chatTranslationGet: 'auth:chat-translation-get',
  chatTranslationSet: 'auth:chat-translation-set',
  logout: 'auth:logout',
  restore: 'auth:restore',
  icafeBranchInfo: 'auth:icafe-branch-info',
  icafeBranchLink: 'auth:icafe-branch-link',
  icafeBranchUnlink: 'auth:icafe-branch-unlink'
} as const

export interface IcafeBranchInfo {
  branchName: string
  xpMultiplier: 1.2
}

export interface IcafeBranchStatus {
  info: IcafeBranchInfo | null
  hasConfig: boolean
  managedExternally: boolean
}

export type SocialAuthProvider = 'google' | 'facebook' | 'discord' | 'steam'

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
  email: string | null
  mmr: number
  level?: number
  levelTitle?: string
  xpIntoLevel?: number
  xpForNextLevel?: number
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

export interface ReferralStatus {
  code: string
  claimed: boolean
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

export type ChatTranslationLanguage = string | null
export interface ChatTranslationPreference {
  language: ChatTranslationLanguage
}

export interface SocialConnectionState {
  connected: boolean
  email: string | null
}

export interface SocialConnections {
  google: SocialConnectionState
  facebook: SocialConnectionState
  discord: SocialConnectionState
  steam: SocialConnectionState
}

export interface AuthApi {
  getIcafeBranchInfo(): Promise<IcafeBranchStatus>
  linkIcafeBranch(code: string): Promise<IcafeBranchStatus>
  unlinkIcafeBranch(): Promise<IcafeBranchStatus>
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
  getReferralStatus(): Promise<ReferralStatus>
  claimReferralCode(code: string): Promise<{ claimed: true }>
  changePassword(credentials: PasswordChangeCredentials): Promise<PasswordChangeResult>
  changeFlagCountryCode(flagCountryCode: string | null): Promise<FlagChangeResult>
  getChatTranslation(): Promise<ChatTranslationPreference>
  setChatTranslation(language: ChatTranslationLanguage): Promise<ChatTranslationPreference>
  restore(): Promise<AuthSession | null>
  logout(): Promise<void>
}

/** Restrict browser handoff for Steam to its HTTPS OpenID endpoint. */
export const validateSteamAuthorizationUrl = (value: string): string => {
  const url = new URL(value)
  if (
    url.origin !== 'https://steamcommunity.com' ||
    url.pathname !== '/openid/login' ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error('The authentication server returned an invalid Steam authorization URL')
  }
  return url.toString()
}
