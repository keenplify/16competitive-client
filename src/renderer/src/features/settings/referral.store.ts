import { create } from 'zustand'

interface ReferralState {
  playerId: string | null
  code: string | null
  claimed: boolean
  status: 'idle' | 'loading' | 'ready' | 'claiming' | 'error'
  error: string | null
  load: (playerId: string) => Promise<void>
  claim: (code: string) => Promise<boolean>
}

const readableError = (error: unknown): string =>
  error instanceof Error
    ? error.message.replace(/^Error invoking remote method '.+?': Error: /, '')
    : 'Could not complete the referral request.'

export const useReferralStore = create<ReferralState>((set, get) => ({
  playerId: null,
  code: null,
  claimed: false,
  status: 'idle',
  error: null,
  load: async (playerId) => {
    set({ playerId, status: 'loading', error: null, code: null, claimed: false })
    try {
      const result = await window.api.auth.getReferralStatus()
      if (get().playerId !== playerId) return
      set({ code: result.code, claimed: result.claimed, status: 'ready' })
    } catch (error) {
      if (get().playerId !== playerId) return
      set({ status: 'error', error: readableError(error) })
    }
  },
  claim: async (code) => {
    if (get().claimed || get().status === 'claiming') return false
    set({ status: 'claiming', error: null })
    try {
      await window.api.auth.claimReferralCode(code)
      set({ claimed: true, status: 'ready' })
      return true
    } catch (error) {
      set({ status: 'ready', error: readableError(error) })
      return false
    }
  }
}))
