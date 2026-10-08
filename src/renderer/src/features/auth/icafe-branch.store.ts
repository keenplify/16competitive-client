import { create } from 'zustand'
import type { IcafeBranchStatus } from '../../../../shared/auth'

const emptyStatus: IcafeBranchStatus = { info: null, hasConfig: false, managedExternally: false }

interface IcafeBranchState {
  loaded: boolean
  busy: boolean
  open: boolean
  error: string | null
  status: IcafeBranchStatus
  load: () => Promise<void>
  toggle: () => void
  close: () => void
  link: (code: string) => Promise<void>
  unlink: () => Promise<void>
}

export const useIcafeBranchStore = create<IcafeBranchState>((set, get) => ({
  loaded: false,
  busy: false,
  open: false,
  error: null,
  status: emptyStatus,
  load: async () => {
    if (get().loaded) return
    try {
      const status = await window.api.auth.getIcafeBranchInfo()
      set({ loaded: true, status })
    } catch {
      set({ loaded: true, status: emptyStatus })
    }
  },
  toggle: () => set((state) => ({ open: !state.open, error: null })),
  close: () => set({ open: false, error: null }),
  link: async (code) => {
    set({ busy: true, error: null })
    try {
      const status = await window.api.auth.linkIcafeBranch(code)
      set({ status, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'ICAFE_LINK_UNAVAILABLE' })
    } finally {
      set({ busy: false })
    }
  },
  unlink: async () => {
    set({ busy: true, error: null })
    try {
      const status = await window.api.auth.unlinkIcafeBranch()
      set({ status, error: null })
    } catch (error) {
      const status = await window.api.auth.getIcafeBranchInfo().catch(() => emptyStatus)
      set({ status, error: error instanceof Error ? error.message : 'ICAFE_UNLINK_UNAVAILABLE' })
    } finally {
      set({ busy: false })
    }
  }
}))
