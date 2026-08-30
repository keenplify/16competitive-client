export const AUTH_CHANNELS = {
  login: 'auth:login',
  register: 'auth:register',
  logout: 'auth:logout',
  restore: 'auth:restore'
} as const

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
  createdAt: string
}

export interface AuthSession {
  expiresAt: string
  player: AuthPlayer
}

export interface AuthApi {
  login(credentials: AuthCredentials): Promise<AuthSession>
  register(credentials: RegistrationCredentials): Promise<AuthSession>
  restore(): Promise<AuthSession | null>
  logout(): Promise<void>
}
