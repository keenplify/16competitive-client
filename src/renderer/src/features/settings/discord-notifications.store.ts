import { create } from 'zustand'
import type { DiscordNotificationStatus } from '../../../../shared/auth'

type DiscordNotice = 'saved' | 'testSent' | null

interface DiscordNotificationsState {
  status: DiscordNotificationStatus | null
  loading: boolean
  saving: boolean
  testing: boolean
  notice: DiscordNotice
  error: string | null
  load: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  test: () => Promise<void>
}

const errorCode = (error: unknown): string =>
  error instanceof Error ? error.message : 'DISCORD_REQUEST_FAILED'

export const useDiscordNotificationsStore = create<DiscordNotificationsState>((set) => ({
  status: null,
  loading: false,
  saving: false,
  testing: false,
  notice: null,
  error: null,
  load: async () => {
    set({ status: null, loading: true, notice: null, error: null })
    try {
      const status = await window.api.auth.getDiscordNotifications()
      set({ status, loading: false })
    } catch (error) {
      set({ loading: false, error: errorCode(error) })
    }
  },
  setEnabled: async (enabled) => {
    set({ saving: true, notice: null, error: null })
    try {
      const status = await window.api.auth.setDiscordNotifications(enabled)
      set({ status, saving: false, notice: 'saved' })
    } catch (error) {
      set({ saving: false, error: errorCode(error) })
    }
  },
  test: async () => {
    set({ testing: true, notice: null, error: null })
    try {
      await window.api.auth.testDiscordNotifications()
      set({ testing: false, notice: 'testSent' })
    } catch (error) {
      set({ testing: false, error: errorCode(error) })
    }
  }
}))
