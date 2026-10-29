import { create } from 'zustand'
import { parsePartnerLoginPreview, type PartnerLoginPreview } from '../shared/partner-login'
import type { AuthSession } from '../shared/auth'
import { takePartnerLogin } from './partner-login-capture'
import { requestJson, getWebSessionToken } from './browser-session'
import { acceptAuth } from './browser-auth'
import { useAuthStore } from '../renderer/src/features/auth/auth.store'

type Phase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'submitting'
  | 'failed'
  | 'waiting_login'
  | 'done'
  | 'account_match'
  | 'password'
  | 'email'
  | 'email_sending'
  | 'verifying'
interface State {
  phase: Phase
  preview: PartnerLoginPreview | null
  error: 'failed' | 'expired' | 'accountLink' | 'alreadyLinked' | null
  initialize: () => Promise<void>
  complete: (action: 'sign_in' | 'link', chooseUsername?: boolean) => Promise<void>
  verificationError: string | null
  verificationMethod: 'password' | 'email' | null
  selectVerification: (method: 'password' | 'email') => Promise<void>
  verify: (credential: string) => Promise<void>
  backToAccountMatch: () => void
  cancel: () => void
  resume: () => void
}
type PartnerAuthResponse = { token: string; expiresAt: string; player: AuthSession['player'] }
const acceptPartnerSession = async (
  response: PartnerAuthResponse,
  originalToken: string | null
): Promise<void> => {
  if (getWebSessionToken() !== originalToken) throw new Error('SESSION_CHANGED')
  if (
    !response ||
    typeof response.token !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(response.token) ||
    typeof response.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(response.expiresAt)) ||
    Date.parse(response.expiresAt) <= Date.now() ||
    !response.player ||
    typeof response.player.id !== 'string' ||
    !/^[a-f0-9-]{36}$/i.test(response.player.id) ||
    typeof response.player.username !== 'string' ||
    typeof response.player.mmr !== 'number' ||
    typeof response.player.points !== 'number' ||
    typeof response.player.hasPassword !== 'boolean' ||
    (response.player.email !== null && typeof response.player.email !== 'string')
  )
    throw new Error('INVALID_SESSION')
  const session = await acceptAuth(response)
  if (getWebSessionToken() !== response.token) throw new Error('SESSION_CHANGED')
  useAuthStore.setState({
    session,
    status: 'authenticated',
    password: '',
    error: null,
    registeredThisSession: session.player.requiresUsernameSetup
  })
}
const verificationMessage = (code?: string): string => {
  switch (code) {
    case 'PARTNER_PASSWORD_INVALID':
      return 'That password could not be verified. Try again or verify by email.'
    case 'PARTNER_PASSWORD_LIMIT':
      return 'Too many password attempts. Return to GameHub and start sign-in again.'
    case 'PARTNER_EMAIL_UNAVAILABLE':
      return 'This account has no email address available for verification. Use its password or sign in normally to link it.'
    case 'PARTNER_EMAIL_COOLDOWN':
      return 'Please wait one minute before requesting another email code.'
    case 'PARTNER_EMAIL_SEND_FAILED':
      return 'The verification email could not be sent. Try again or use your password.'
    case 'PARTNER_EMAIL_CODE_INVALID':
      return 'The code is invalid or expired. Check the code or request a new one.'
    case 'INVALID_PARTNER_HANDOFF':
      return 'This sign-in expired. Return to GameHub and press Play again.'
    case 'PARTNER_IDENTITY_ALREADY_LINKED':
      return 'This partner identity is already linked to another completed account. Sign in normally to manage its links.'
    case 'ACCOUNT_BANNED':
      return 'This account cannot sign in. Sign in normally for account details.'
    default:
      return 'Verification could not be completed. Please try again.'
  }
}
// Log only protocol diagnostics, never error objects, request bodies, URLs or credentials.
const logPartnerLoginFailure = (stage: string, error: unknown): void => {
  const details = error as { code?: unknown; status?: unknown } | null
  const code =
    typeof details?.code === 'string' &&
    /^(?:PARTNER_|INVALID_|ACCOUNT_)[A-Z_]{1,48}$/.test(details.code)
      ? details.code
      : 'REQUEST_FAILED'
  console.warn('Sign-in could not be completed. Return to the partner app and press PLAY again.', {
    stage,
    code,
    ...(typeof details?.status === 'number' ? { status: details.status } : {})
  })
}

export const usePartnerLoginStore = create<State>((set, get) => ({
  phase: 'idle',
  preview: null,
  error: null,
  verificationError: null,
  verificationMethod: null,
  initialize: async () => {
    if (get().phase !== 'idle') return
    const incoming = takePartnerLogin()
    if (!incoming) {
      set({ phase: 'done' })
      return
    }
    if (incoming === 'invalid') {
      logPartnerLoginFailure('capture', { code: 'INVALID_PARTNER_HANDOFF' })
      set({ phase: 'failed', error: 'failed' })
      return
    }
    set({ phase: 'loading', error: null })
    try {
      const response = await requestJson('/auth/partner-login/begin', {
        clearOnUnauthorized: false,
        timeoutMs: 15_000,
        init: { method: 'POST', body: JSON.stringify(incoming) }
      })
      if (get().phase === 'loading')
        set({ phase: 'ready', preview: parsePartnerLoginPreview(response, incoming.partnerId) })
    } catch (error) {
      logPartnerLoginFailure('begin', error)
      if (get().phase === 'loading') set({ phase: 'failed', error: 'failed' })
    }
  },
  cancel: () => {
    if (!['submitting', 'verifying', 'email_sending'].includes(get().phase))
      set({
        phase: 'done',
        preview: null,
        error: null,
        verificationError: null,
        verificationMethod: null
      })
  },
  resume: () => {
    if (get().phase === 'waiting_login') set({ phase: 'ready' })
  },
  backToAccountMatch: () => {
    if (get().phase !== 'verifying' && get().phase !== 'email_sending')
      set({ phase: 'account_match', verificationError: null, verificationMethod: null })
  },
  selectVerification: async (method) => {
    const { preview, phase } = get()
    if (!preview || !['account_match', 'password', 'email'].includes(phase)) return
    if (method === 'password') {
      set({ phase: 'password', verificationMethod: method, verificationError: null })
      return
    }
    set({ phase: 'email_sending', verificationMethod: method, verificationError: null })
    try {
      await requestJson('/auth/partner-login/email/start', {
        clearOnUnauthorized: false,
        init: { method: 'POST', body: JSON.stringify({ proof: preview.proof }) }
      })
      set({ phase: 'email' })
    } catch (error) {
      logPartnerLoginFailure('email_start', error)
      set({
        phase: 'account_match',
        verificationError: verificationMessage((error as { code?: string }).code)
      })
    }
  },
  verify: async (credential) => {
    const { preview, phase, verificationMethod } = get()
    if (!preview || !verificationMethod || phase !== verificationMethod) return
    const originalToken = getWebSessionToken()
    set({ phase: 'verifying', verificationError: null })
    try {
      const response = await requestJson<PartnerAuthResponse>(
        verificationMethod === 'password'
          ? '/auth/partner-login/verify-password'
          : '/auth/partner-login/email/verify',
        {
          clearOnUnauthorized: false,
          init: {
            method: 'POST',
            body: JSON.stringify({
              proof: preview.proof,
              ...(verificationMethod === 'password'
                ? { password: credential }
                : { code: credential })
            })
          }
        }
      )
      await acceptPartnerSession(response, originalToken)
      set({
        phase: 'done',
        preview: null,
        error: null,
        verificationError: null,
        verificationMethod: null
      })
    } catch (error) {
      logPartnerLoginFailure('verify_' + verificationMethod, error)
      set({
        phase: verificationMethod,
        verificationError: verificationMessage((error as { code?: string }).code)
      })
    }
  },
  complete: async (action, chooseUsername = false) => {
    const { phase, preview } = get()
    const auth = useAuthStore.getState()
    if (
      (phase !== 'ready' && !(phase === 'account_match' && chooseUsername)) ||
      !preview ||
      auth.status === 'restoring' ||
      auth.status === 'submitting'
    )
      return
    if (Date.parse(preview.expiresAt) <= Date.now()) {
      set({ phase: 'failed', preview: null, error: 'expired' })
      return
    }
    if (action === 'link' && !auth.session) return
    const originalToken = getWebSessionToken()
    set({ phase: 'submitting', error: null })
    try {
      const response = await requestJson<{
        token: string
        expiresAt: string
        player: AuthSession['player']
      }>('/auth/partner-login/complete', {
        authenticated: action === 'link',
        clearOnUnauthorized: false,
        init: {
          method: 'POST',
          body: JSON.stringify({
            proof: preview.proof,
            action,
            ...(chooseUsername ? { chooseUsername: true } : {})
          })
        }
      })
      await acceptPartnerSession(response, originalToken)
      set({ phase: 'done', preview: null, error: null })
    } catch (error) {
      logPartnerLoginFailure('complete', error)
      const code = (error as { code?: string }).code
      if (code === 'PARTNER_USERNAME_TAKEN') {
        set({ phase: 'account_match', error: null, verificationError: null })
        return
      }
      if (code === 'PARTNER_ACCOUNT_LINK_REQUIRED') {
        set({ phase: 'waiting_login', error: 'accountLink' })
        return
      }
      set({
        phase: 'failed',
        preview: null,
        error: code === 'PARTNER_IDENTITY_ALREADY_LINKED' ? 'alreadyLinked' : 'failed'
      })
    }
  }
}))
