import { toast } from 'react-toastify'
import { translate, useLanguageStore } from '../i18n/i18n'
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
    const language = useLanguageStore.getState().language
    const id = toast.loading(translate(language, 'gameSetup.pending'))
    set({ status: 'choosing', error: null, launched: false })
    try {
      const result = await window.api.legacyGame.choose()
      if (result.ok) {
        if (result.value) set({ profile: result.value })
        toast.update(id, {
          render: translate(language, result.value ? 'gameSetup.done' : 'gameSetup.cancelled'),
          type: result.value ? 'success' : 'info',
          isLoading: false,
          autoClose: 4000
        })
      } else {
        set({ error: result.error })
        toast.update(id, {
          render: translate(language, `legacy.error.${result.error}`),
          type: 'error',
          isLoading: false,
          autoClose: 5000
        })
      }
    } catch {
      set({ error: 'settingsFailed' })
      toast.update(id, {
        render: translate(language, 'legacy.error.settingsFailed'),
        type: 'error',
        isLoading: false,
        autoClose: 5000
      })
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
