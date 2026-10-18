import { create } from 'zustand'
import type { PartnerPresence } from '../../../../shared/partner-community'
import { useAuthStore } from '../auth/auth.store'

type State = {
  accountId: string | null
  presence: PartnerPresence | null
  refresh: () => Promise<void>
  clear: () => void
}

let generation = 0
let pending = false

export const usePartnerPresenceStore = create<State>((set, get) => ({
  accountId: null,
  presence: null,
  refresh: async () => {
    const accountId = useAuthStore.getState().session?.player.id ?? null
    if (!accountId) {
      get().clear()
      return
    }
    if (pending) return
    pending = true
    const request = generation
    try {
      const presence = await window.api.partnerServers.presence()
      if (request !== generation || useAuthStore.getState().session?.player.id !== accountId) return
      set({ accountId, presence })
    } catch {
      // Keep the last confirmed state through a brief API failure. Server heartbeat expiry resolves it.
    } finally {
      pending = false
    }
  },
  clear: () => {
    generation++
    set({ accountId: null, presence: null })
  }
}))
