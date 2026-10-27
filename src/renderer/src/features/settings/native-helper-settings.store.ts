import { create } from 'zustand'
import type {
  NativeHelperSettings,
  NativeHelperSettingsRequest
} from '../../../../shared/native-helper-settings'
import { useWebHelperPromptStore } from '../matchmaking/web-helper-prompt.store'

interface NativeSettingsState {
  settings: NativeHelperSettings | null
  status: 'idle' | 'loading' | 'saving' | 'choosing-cs13' | 'choosing-cs16' | 'error'
  accountId: string | null
  load: (accountId: string) => Promise<void>
  choose: (game: 'cs13' | 'cs16') => Promise<void>
  save: (
    update: Partial<Omit<NativeHelperSettings, 'cs13FolderPath' | 'cs16FolderPath'>>
  ) => Promise<void>
}

export const useNativeHelperSettingsStore = create<NativeSettingsState>((set, get) => {
  const request = async (value: NativeHelperSettingsRequest): Promise<NativeHelperSettings> => {
    const api = window.api.matchmaking.nativeHelperSettings
    if (!api) throw new Error('Native helper unavailable')
    // A short-lived local bridge may have closed while Settings was inactive.
    // Retry only reads; never duplicate a native picker or a settings mutation.
    try {
      return await api(value)
    } catch (error) {
      if (value.action !== 'get') throw error
      if ((await useWebHelperPromptStore.getState().checkNative()) !== 'rust') throw error
      return await api(value)
    }
  }
  return {
    settings: null,
    status: 'idle',
    accountId: null,
    load: async (accountId) => {
      if (get().status === 'loading' && get().accountId === accountId) return
      set({
        accountId,
        settings: get().accountId === accountId ? get().settings : null,
        status: 'loading'
      })
      try {
        const settings = await request({ action: 'get' })
        if (get().accountId === accountId) set({ settings, status: 'idle' })
      } catch {
        if (get().accountId === accountId) set({ status: 'error' })
      }
    },
    choose: async (game) => {
      if (!['idle', 'error'].includes(get().status)) return
      const accountId = get().accountId
      set({ status: `choosing-${game}` })
      try {
        const settings = await request({ action: 'choose', game })
        if (get().accountId === accountId) set({ settings, status: 'idle' })
      } catch {
        if (get().accountId === accountId) set({ status: 'error' })
      }
    },
    save: async (update) => {
      const current = get().settings
      if (!current || !['idle', 'error'].includes(get().status)) return
      const accountId = get().accountId
      set({ status: 'saving' })
      try {
        const values = { ...current, ...update }
        const settings = {
          display: values.display,
          currentDisplayResolution: values.currentDisplayResolution,
          fastSwitchEnabled: values.fastSwitchEnabled,
          enhancementsEnabled: values.enhancementsEnabled,
          lightweightHud: values.lightweightHud,
          killCardsEnabled: values.killCardsEnabled
        }
        const saved = await request({ action: 'save', settings })
        if (get().accountId === accountId) set({ settings: saved, status: 'idle' })
      } catch {
        if (get().accountId === accountId) set({ status: 'error' })
      }
    }
  }
})
