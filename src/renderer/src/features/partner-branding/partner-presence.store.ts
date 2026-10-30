import { create } from 'zustand'
import type { PartnerPresence } from '../../../../shared/partner-community'
import { useAuthStore } from '../auth/auth.store'

type State = {
  accountId: string | null
  presence: PartnerPresence | null
  dismissedConnectionId: string | null
  launching: boolean
  launchError: boolean
  dismissSession: () => void
  reconnect: () => Promise<void>
  refresh: () => Promise<void>
  clear: () => void
}

let generation = 0
let pending = false

export const usePartnerPresenceStore = create<State>((set, get) => ({
  accountId: null,
  presence: null,
  dismissedConnectionId: null,
  launching: false,
  launchError: false,
  dismissSession: () => set({ dismissedConnectionId: get().presence?.connectionId ?? null }),
  reconnect: async () => {
    const { presence, launching, accountId } = get()
    if (!presence || launching || accountId !== useAuthStore.getState().session?.player.id) return
    set({ launching: true, launchError: false })
    try {
      await window.api.partnerServers.connect(presence.server.id, undefined, presence.communityId)
    } catch {
      if (get().accountId === accountId && get().presence?.connectionId === presence.connectionId)
        set({ launchError: true })
    } finally {
      if (get().accountId === accountId && get().presence?.connectionId === presence.connectionId)
        set({ launching: false })
    }
  },
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
      set({
        accountId,
        presence,
        ...(get().accountId !== accountId ? { launching: false } : {}),
        ...(get().presence?.connectionId !== presence?.connectionId
          ? { dismissedConnectionId: null, launchError: false, launching: false }
          : {})
      })
    } catch {
      // Do not retain an in-game screen indefinitely through an API outage.
      const current = get().presence
      if (current && Date.now() - Date.parse(current.seenAt) > 35_000)
        set({ presence: null, dismissedConnectionId: null })
    } finally {
      pending = false
    }
  },
  clear: () => {
    generation++
    set({
      accountId: null,
      presence: null,
      dismissedConnectionId: null,
      launching: false,
      launchError: false
    })
  }
}))
