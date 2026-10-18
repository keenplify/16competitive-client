import { create } from 'zustand'
import type { PartnerLaunchGroup } from '../../../../shared/partner-community'
import { useAuthStore } from '../auth/auth.store'

type State = {
  accountId: string | null
  group: PartnerLaunchGroup | null
  busy: 'idle' | 'starting' | 'responding' | 'launching'
  error: boolean
  start: (serverId: string) => Promise<void>
  refresh: () => Promise<void>
  respond: (accepted: boolean) => Promise<void>
  launch: () => Promise<void>
  dismiss: () => void
}
let serial = 0
let refreshing = false
export const usePartnerLaunchStore = create<State>((set, get) => ({
  accountId: null,
  group: null,
  busy: 'idle',
  error: false,
  start: async (serverId) => {
    if (get().busy !== 'idle') return
    const accountId = useAuthStore.getState().session?.player.id ?? null
    if (!accountId) return
    set({ busy: 'starting', error: false })
    try {
      const group = await window.api.partnerServers.startGroup(serverId)
      if (accountId !== useAuthStore.getState().session?.player.id) return
      serial++
      set({ accountId, group })
      await window.api.window.focus()
    } catch {
      set({ error: true })
    } finally {
      set({ busy: 'idle' })
    }
  },
  refresh: async () => {
    const accountId = useAuthStore.getState().session?.player.id ?? null
    if (!accountId) {
      get().dismiss()
      return
    }
    if (refreshing || get().busy === 'launching') return
    refreshing = true
    const request = serial
    try {
      const current = get().group
      const group = current
        ? await window.api.partnerServers.getGroup(current.id)
        : await window.api.partnerServers.pendingGroup()
      if (request !== serial || accountId !== useAuthStore.getState().session?.player.id) return
      if (group && !current) void window.api.window.focus().catch(() => undefined)
      set({ accountId, group })
    } catch {
      // A transient poll failure must not discard an active ready check.
    } finally {
      refreshing = false
    }
  },
  respond: async (accepted) => {
    const group = get().group
    if (!group || group.status !== 'pending' || get().busy !== 'idle') return
    set({ busy: 'responding', error: false })
    try {
      const next = await window.api.partnerServers.respondGroup(group.id, accepted)
      if (get().group?.id === group.id) set({ group: next })
    } catch {
      set({ error: true })
    } finally {
      set({ busy: 'idle' })
    }
  },
  launch: async () => {
    const group = get().group
    const playerId = useAuthStore.getState().session?.player.id
    if (!group || group.status !== 'ready' || !group.members.some(member => member.id === playerId && member.accepted) || get().busy !== 'idle') return
    set({ busy: 'launching', error: false })
    try {
      await window.api.partnerServers.connect(group.server.id, group.id)
      get().dismiss()
    } catch {
      set({ busy: 'idle', error: true })
    }
  },
  dismiss: () => {
    serial++
    set({ accountId: null, group: null, busy: 'idle', error: false })
  }
}))
