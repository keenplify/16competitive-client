import { create } from 'zustand'

const KEY = '16competitive.web.helper-prompt-never'

interface WebHelperPromptState {
  open: boolean
  neverShow: boolean
  shownThisSession: boolean
  status: 'idle' | 'checking' | 'electron' | 'rust' | 'outdated-electron' | 'outdated-rust' | 'unavailable'
  show: () => void
  close: () => void
  dismissForever: () => void
  setStatus: (status: WebHelperPromptState['status']) => void
}

export const useWebHelperPromptStore = create<WebHelperPromptState>((set) => ({
  open: false,
  neverShow: localStorage.getItem(KEY) === '1',
  shownThisSession: false,
  status: 'idle',
  show: () => set({ open: true, shownThisSession: true }),
  close: () => set({ open: false }),
  setStatus: (status) => set({ status }),
  dismissForever: () => {
    localStorage.setItem(KEY, '1')
    set({ open: false, neverShow: true })
  }
}))
