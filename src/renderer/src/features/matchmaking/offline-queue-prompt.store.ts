import { isWebRuntime } from '../../web-runtime'
import { create } from 'zustand'
import { useAuthStore } from '../auth/auth.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useMatchmakingStore } from './matchmaking.store'

interface OfflineQueuePromptState {
  open: boolean
  checking: boolean
  promptPlayerId: string | null
  serviceUnavailable: boolean
  dismissedPlayerId: string | null
  requestQueue: (playerId: string) => Promise<void>
  continueQueue: (playerId: string) => void
  openSettings: () => void
  close: () => void
}

const canJoin = (playerId: string): boolean =>
  useAuthStore.getState().session?.player.id === playerId &&
  useMatchmakingStore.getState().selectedMode === '5v5' &&
  useMatchmakingStore.getState().queueStatus === 'idle'

const joinQueue = (playerId: string): void => {
  if (canJoin(playerId)) void useMatchmakingStore.getState().joinQueue()
}

export const useOfflineQueuePromptStore = create<OfflineQueuePromptState>((set, get) => ({
  open: false,
  checking: false,
  promptPlayerId: null,
  serviceUnavailable: false,
  dismissedPlayerId: null,
  requestQueue: async (playerId) => {
    if (!canJoin(playerId) || get().checking) return
    if (get().open && get().promptPlayerId === playerId) return
    if (get().dismissedPlayerId === playerId) {
      joinQueue(playerId)
      return
    }
    if (!isWebRuntime()) {
      joinQueue(playerId)
      return
    }
    set({ checking: true, open: false, promptPlayerId: null, serviceUnavailable: false })
    const push = await (
      await import('../../../../web/browser-push')
    )
      .getBrowserPushStatus()
      .catch(() => null)
    if (push?.enabled) {
      set({ checking: false })
      joinQueue(playerId)
      return
    }
    const status = await window.api.auth.getDiscordNotifications().catch(() => null)
    set({ checking: false })
    if (!canJoin(playerId)) return
    if (!status || (status.linked && status.enabled && status.available)) {
      joinQueue(playerId)
      return
    }
    set({ open: true, promptPlayerId: playerId, serviceUnavailable: !status.available })
  },
  continueQueue: (playerId) => {
    if (get().promptPlayerId !== playerId) return
    set({ open: false, promptPlayerId: null, dismissedPlayerId: playerId })
    joinQueue(playerId)
  },
  openSettings: () => {
    set({ open: false, promptPlayerId: null })
    useNavigationStore.getState().openDiscordSettings()
  },
  close: () => set({ open: false, promptPlayerId: null })
}))
