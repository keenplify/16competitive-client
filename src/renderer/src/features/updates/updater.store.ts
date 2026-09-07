import { create } from 'zustand'
import type { AppUpdateStatus } from '../../../../shared/updater'

interface UpdaterState {
  currentVersion: string | null
  status: AppUpdateStatus
  stopListening: (() => void) | null
  startListening(): void
  stopListeningToUpdates(): void
  restartAndInstall(): Promise<void>
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  currentVersion: null,
  status: { state: 'idle' },
  stopListening: null,
  startListening: () => {
    if (get().stopListening) return

    const stopListening = window.api.updater.onStatus((status) => set({ status }))
    set({ stopListening })
    void window.api.updater.getCurrentVersion().then((currentVersion) => set({ currentVersion }))
    void window.api.updater.getStatus().then((status) => set({ status }))
  },
  stopListeningToUpdates: () => {
    get().stopListening?.()
    set({ stopListening: null })
  },
  restartAndInstall: async () => {
    await window.api.updater.restartAndInstall()
  }
}))
