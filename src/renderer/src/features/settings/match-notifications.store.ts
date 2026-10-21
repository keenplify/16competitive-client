import { create } from 'zustand'
import type { BrowserPushStatus } from '../../../../web/browser-push'
import { useLanguageStore } from '../i18n/i18n'

interface MatchNotificationsState {
  status: BrowserPushStatus | null
  busy: boolean
  error: boolean
  load: () => Promise<void>
  enable: () => Promise<void>
  disable: () => Promise<void>
}
export const useMatchNotificationsStore = create<MatchNotificationsState>((set, get) => ({
  status: null,
  busy: false,
  error: false,
  load: async () => {
    if (get().busy) return
    set({ busy: true, error: false })
    try {
      set({ status: await (await import('../../../../web/browser-push')).getBrowserPushStatus() })
    } catch {
      set({ error: true })
    } finally {
      set({ busy: false })
    }
  },
  enable: async () => {
    if (get().busy) return
    set({ busy: true, error: false })
    try {
      // Request permission during the button's user gesture, before asynchronous imports/network calls.
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('PUSH_PERMISSION')
      const api = await import('../../../../web/browser-push')
      await api.enableBrowserPush(useLanguageStore.getState().language)
      set({ status: await api.getBrowserPushStatus() })
    } catch {
      set({
        error: true,
        status: get().status
          ? { ...get().status!, blocked: Notification.permission === 'denied' }
          : null
      })
    } finally {
      set({ busy: false })
    }
  },
  disable: async () => {
    if (get().busy) return
    set({ busy: true, error: false })
    try {
      const api = await import('../../../../web/browser-push')
      await api.disableBrowserPush()
      set({ status: await api.getBrowserPushStatus() })
    } catch {
      set({ error: true })
    } finally {
      set({ busy: false })
    }
  }
}))
