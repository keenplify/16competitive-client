import { communityServerCache } from '../communities/community-cache'
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
export function createPartnerServersStore(communityId?: string) {
  let serial = 0
  let refreshing = false
  return create<State>((set, get) => ({
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
      if (refreshing && get().accountId === accountId) return
      const cacheKey = communityId ?? 'membership'
      const cached = communityServerCache.read(accountId, cacheKey)
      refreshing = true
      const request = ++serial
      set((state) => ({
        status:
          cached || (state.accountId === accountId && state.rows.length) ? 'ready' : 'loading',
        error: null,
        accountId,
        ...(state.accountId !== accountId
          ? { rows: cached ?? [], selectedId: null }
          : state.rows.length === 0 && cached
            ? { rows: cached }
            : {})
      }))
      try {
        const rows = sortPartnerServers(await window.api.partnerServers.list(communityId))
        if (serial !== request || useAuthStore.getState().session?.player.id !== accountId) return
        communityServerCache.write(accountId, cacheKey, rows)
        set((state) => ({
          rows: JSON.stringify(state.rows) === JSON.stringify(rows) ? state.rows : rows,
          status: 'ready',
          selectedId: rows.some((row) => row.id === state.selectedId) ? state.selectedId : null
        }))
      } catch {
        if (serial === request)
          set({ status: get().rows.length ? 'ready' : 'error', error: 'loadError' })
      } finally {
        if (serial === request) refreshing = false
      }
    },
    select: (selectedId) => set({ selectedId, error: null }),
    connect: async () => {
      const id = get().selectedId
      if (!id || get().connecting) return
      set({ connecting: true, error: null })
      try {
        await window.api.partnerServers.connect(id, undefined, communityId)
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
      refreshing = false
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
}
export const usePartnerServersStore = createPartnerServersStore()
