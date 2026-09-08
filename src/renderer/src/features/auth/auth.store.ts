import { create } from 'zustand'
import type { AuthSession, SocialAuthProvider } from '../../../../shared/auth'

type AuthMode = 'login' | 'register'
type AuthStatus =
  | 'idle'
  | 'restoring'
  | 'submitting'
  | 'authenticated'
  | 'changing_username'
  | 'logging_out'

interface AuthState {
  mode: AuthMode
  username: string
  email: string
  password: string
  status: AuthStatus
  socialProvider: SocialAuthProvider | null
  error: string | null
  session: AuthSession | null
  setMode: (mode: AuthMode) => void
  setUsername: (username: string) => void
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  submit: () => Promise<void>
  loginWithSocial: (provider: SocialAuthProvider) => Promise<void>
  checkUsername: (username: string) => Promise<boolean>
  changeUsername: (username: string) => Promise<boolean>
  restore: () => Promise<void>
  refreshSession: () => Promise<void>
  logout: () => Promise<void>
  setMmr: (mmr: number) => void
  setPoints: (points: number) => void
}

const usernamePattern = /^[A-Za-z0-9_]{3,32}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const readableError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Authentication failed. Please try again.'
  const remoteError = error.message.match(/Error: (.+)$/)
  return remoteError?.[1] ?? error.message
}

export const useAuthStore = create<AuthState>((set, get) => ({
  mode: 'login',
  username: '',
  email: '',
  password: '',
  status: 'restoring',
  socialProvider: null,
  error: null,
  session: null,

  restore: async () => {
    if (get().status !== 'idle' && get().status !== 'restoring') return
    set({ status: 'restoring', error: null })
    try {
      const session = await window.api.auth.restore()
      set(session ? { session, status: 'authenticated' } : { session: null, status: 'idle' })
    } catch {
      set({ session: null, status: 'idle' })
    }
  },

  refreshSession: async () => {
    if (!get().session) return
    try {
      const session = await window.api.auth.restore()
      if (session) set({ session })
    } catch {
      // A transient refresh failure must not sign out an active player.
    }
  },

  setMode: (mode) => set({ mode, error: null, password: '' }),
  setUsername: (username) => set({ username, error: null }),
  setEmail: (email) => set({ email, error: null }),
  setPassword: (password) => set({ password, error: null }),
  setPoints: (points) =>
    set((state) =>
      state.session
        ? { session: { ...state.session, player: { ...state.session.player, points } } }
        : state
    ),
  setMmr: (mmr) =>
    set((state) =>
      state.session
        ? { session: { ...state.session, player: { ...state.session.player, mmr } } }
        : state
    ),

  submit: async () => {
    const { email, mode, password, status, username } = get()
    if (status === 'submitting') return

    if (!usernamePattern.test(username)) {
      set({ error: 'Username must be 3–32 characters using letters, numbers, or underscores.' })
      return
    }

    if (password.length < 8 || password.length > 128) {
      set({ error: 'Password must be 8–128 characters.' })
      return
    }

    const normalizedEmail = email.trim()
    if (
      mode === 'register' &&
      (normalizedEmail.length > 254 || !emailPattern.test(normalizedEmail))
    ) {
      set({ error: 'Enter a valid email address.' })
      return
    }

    set({ status: 'submitting', socialProvider: null, error: null })

    try {
      const session =
        mode === 'register'
          ? await window.api.auth.register({ username, email: normalizedEmail, password })
          : await window.api.auth.login({ username, password })
      set({ session, status: 'authenticated', socialProvider: null, password: '' })
    } catch (error) {
      set({ status: 'idle', socialProvider: null, error: readableError(error) })
    }
  },

  loginWithSocial: async (provider) => {
    if (get().status === 'submitting') return
    set({ status: 'submitting', socialProvider: provider, error: null })

    try {
      const session = await window.api.auth.social(provider)
      set({ session, status: 'authenticated', socialProvider: null, password: '' })
    } catch (error) {
      set({ status: 'idle', socialProvider: null, error: readableError(error) })
    }
  },

  checkUsername: async (username) => {
    if (!usernamePattern.test(username)) return false
    try {
      return (await window.api.auth.checkUsername(username)).available
    } catch {
      return false
    }
  },

  changeUsername: async (username) => {
    if (!usernamePattern.test(username)) {
      set({ error: 'Username must be 3–32 characters using letters, numbers, or underscores.' })
      return false
    }
    if (!get().session || get().status === 'changing_username') return false

    set({ status: 'changing_username', error: null })
    try {
      const result = await window.api.auth.changeUsername(username)
      set((state) => ({
        status: 'authenticated',
        error: null,
        session: state.session
          ? {
              ...state.session,
              player: {
                ...state.session.player,
                username: result.username,
                requiresUsernameSetup: result.requiresUsernameSetup,
                usernameChangeAvailableAt: result.usernameChangeAvailableAt
              }
            }
          : state.session
      }))
      return true
    } catch (error) {
      set({ status: 'authenticated', error: readableError(error) })
      return false
    }
  },

  logout: async () => {
    if (get().status === 'logging_out') return
    set({ status: 'logging_out', socialProvider: null, error: null })

    try {
      await window.api.auth.logout()
    } finally {
      set({
        mode: 'login',
        username: '',
        email: '',
        password: '',
        status: 'idle',
        socialProvider: null,
        error: null,
        session: null
      })
    }
  }
}))
