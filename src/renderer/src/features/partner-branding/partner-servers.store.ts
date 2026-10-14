import { create } from 'zustand'
import { sortPartnerServers, type PartnerServerStatus } from '../../../../shared/partner-community'
import { useAuthStore } from '../auth/auth.store'
type State = {
  accountId: string | null
  rows: PartnerServerStatus[]
  selectedId: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  connecting: boolean
  error: string | null
  load: () => Promise<void>
  select: (id: string) => void
  connect: () => Promise<void>
  clear: () => void
}
let serial = 0
export const usePartnerServersStore = create<State>((set, get) => ({
  accountId: null,
  rows: [],
  selectedId: null,
  status: 'idle',
  connecting: false,
  error: null,
  load: async () => {
    const accountId = useAuthStore.getState().session?.player.id ?? null
    if (!accountId) {
      get().clear()
      return
    }
    if (get().status === 'loading' && get().accountId === accountId) return
    const request = ++serial
    set((state) => ({
      status: 'loading',
      error: null,
      accountId,
      ...(state.accountId !== accountId ? { rows: [], selectedId: null } : {})
    }))
    try {
      const rows = sortPartnerServers(await window.api.partnerServers.list())
      if (serial !== request || useAuthStore.getState().session?.player.id !== accountId) return
      set((state) => ({
        rows,
        status: 'ready',
        selectedId: rows.some((row) => row.id === state.selectedId) ? state.selectedId : null
      }))
    } catch {
      if (serial === request) set({ status: 'error', error: 'loadError' })
    }
  },
  select: (selectedId) => set({ selectedId, error: null }),
  connect: async () => {
    const id = get().selectedId
    if (!id || get().connecting) return
    set({ connecting: true, error: null })
    try {
      await window.api.partnerServers.connect(id)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      set({
        error: message.includes('INSTALLATION_REQUIRED')
          ? 'installation'
          : message.includes('MATCH_BUSY')
            ? 'busy'
            : 'launchFailed'
      })
    } finally {
      set({ connecting: false })
    }
  },
  clear: () => {
    serial++
    set({
      accountId: null,
      rows: [],
      selectedId: null,
      status: 'idle',
      connecting: false,
      error: null
    })
  }
}))
