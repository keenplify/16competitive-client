import { create } from 'zustand'
import type { LegacyGameError, LegacyGameProfile } from '../../../../shared/legacy-game'

interface LegacyGameState {
  profile: LegacyGameProfile
  status: 'loading' | 'idle' | 'choosing' | 'launching'
  error: LegacyGameError | null
  launched: boolean
  load: () => Promise<void>
  choose: () => Promise<void>
  launch: () => Promise<void>
  openDownload: () => Promise<void>
}

export const useLegacyGameStore = create<LegacyGameState>((set, get) => ({
  profile: { folderPath: null, installation: null },
  status: 'loading',
  error: null,
  launched: false,
  openDownload: async () => {
    try {
      const result = await window.api.legacyGame.openDownload()
      if (!result.ok) set({ error: result.error })
    } catch {
      set({ error: 'downloadFailed' })
    }
  },
  load: async () => {
    if (get().status === 'choosing' || get().status === 'launching') return
    set({ status: 'loading', error: null, launched: false })
    try {
      const result = await window.api.legacyGame.get()
      if (result.ok)
        set({
          profile: result.value,
          error:
            result.value.folderPath && !result.value.installation ? 'invalidInstallation' : null
        })
      else set({ error: result.error })
    } catch {
      set({ error: 'settingsFailed' })
    } finally {
      set({ status: 'idle' })
    }
  },
  choose: async () => {
    if (get().status !== 'idle') return
    set({ status: 'choosing', error: null, launched: false })
    try {
      const result = await window.api.legacyGame.choose()
      if (result.ok) {
        if (result.value) set({ profile: result.value })
      } else set({ error: result.error })
    } catch {
      set({ error: 'settingsFailed' })
    } finally {
      set({ status: 'idle' })
    }
  },
  launch: async () => {
    if (get().status !== 'idle') return
    set({ status: 'launching', error: null, launched: false })
    try {
      const result = await window.api.legacyGame.launch()
      if (result.ok) set({ launched: true })
      else {
        set({ error: result.error })
        if (result.error === 'invalidInstallation' || result.error === 'installationRequired')
          set({ profile: { ...get().profile, installation: null } })
      }
    } catch {
      set({ error: 'launchFailed' })
    } finally {
      set({ status: 'idle' })
    }
  }
}))
