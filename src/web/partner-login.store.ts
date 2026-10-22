import { create } from 'zustand'
import { parsePartnerLoginPreview, type PartnerLoginPreview } from '../shared/partner-login'
import type { AuthSession } from '../shared/auth'
import { takePartnerLogin } from './partner-login-capture'
import { requestJson, getWebSessionToken } from './browser-session'
import { acceptAuth } from './browser-auth'
import { useAuthStore } from '../renderer/src/features/auth/auth.store'

type Phase = 'idle' | 'loading' | 'ready' | 'submitting' | 'failed' | 'waiting_login' | 'done'
interface State {
  phase: Phase
  preview: PartnerLoginPreview | null
  error: 'failed' | 'expired' | 'accountLink' | 'alreadyLinked' | null
  initialize: () => Promise<void>
  complete: (action: 'sign_in' | 'link') => Promise<void>
  cancel: () => void
  resume: () => void
}
export const usePartnerLoginStore = create<State>((set, get) => ({
  phase: 'idle',
  preview: null,
  error: null,
  initialize: async () => {
    if (get().phase !== 'idle') return
    const incoming = takePartnerLogin()
    if (!incoming) {
      set({ phase: 'done' })
      return
    }
    if (incoming === 'invalid') {
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
    } catch {
      if (get().phase === 'loading') set({ phase: 'failed', error: 'failed' })
    }
  },
  cancel: () => {
    if (get().phase !== 'submitting') set({ phase: 'done', preview: null, error: null })
  },
  resume: () => {
    if (get().phase === 'waiting_login') set({ phase: 'ready' })
  },
  complete: async (action) => {
    const { phase, preview } = get()
    const auth = useAuthStore.getState()
    if (
      phase !== 'ready' ||
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
        init: { method: 'POST', body: JSON.stringify({ proof: preview.proof, action }) }
      })
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
      set({ phase: 'done', preview: null, error: null })
    } catch (error) {
      const code = (error as { code?: string }).code
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
