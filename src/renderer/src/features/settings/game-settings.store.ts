import { create } from 'zustand'
import { DEFAULT_CROSSHAIR, type CrosshairProfile } from '../../../../shared/crosshair'

interface GameSettingsState {
  folderPath: string
  savedPath: string | null
  configFilePath: string | null
  status: 'idle' | 'loading' | 'choosing' | 'saving'
  error: string | null
  notice: string | null
  requiresGameSetup: boolean
  crosshair: CrosshairProfile
  setCrosshair: (profile: CrosshairProfile) => Promise<void>
  load: () => Promise<void>
  choose: () => Promise<void>
  save: () => Promise<void>
  promptToConfigureForMatch: () => void
}

const message = (error: unknown): string =>
  error instanceof Error
    ? error.message.replace(/^Error invoking remote method '.+?': Error: /, '')
    : 'Request failed.'

export const useGameSettingsStore = create<GameSettingsState>((set, get) => ({
  folderPath: '',
  savedPath: null,
  configFilePath: null,
  status: 'idle',
  error: null,
  notice: null,
  requiresGameSetup: false,
  crosshair: DEFAULT_CROSSHAIR,

  setCrosshair: async (profile) => {
    const settings = await window.api.gameSettings.setCrosshair(profile)
    set({ crosshair: settings.crosshair })
  },

  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const settings = await window.api.gameSettings.get()
      set({
        folderPath: settings.cs16FolderPath ?? '',
        savedPath: settings.cs16FolderPath,
        configFilePath: settings.configFilePath,
        status: 'idle',
        requiresGameSetup: !settings.cs16ExecutablePath,
        crosshair: settings.crosshair
      })
    } catch (error) {
      set({ status: 'idle', error: message(error) })
    }
  },

  choose: async () => {
    set({ status: 'choosing', error: null, notice: null })
    try {
      const folderPath = await window.api.gameSettings.chooseFolder()
      if (!folderPath) {
        set({ status: 'idle' })
        return
      }
      set({ folderPath })
      await get().save()
    } catch (error) {
      set({ status: 'idle', error: message(error) })
    }
  },

  save: async () => {
    const folderPath = get().folderPath
    set({ status: 'saving', error: null, notice: null })
    try {
      const settings = await window.api.gameSettings.save(folderPath)
      set({
        folderPath: settings.cs16FolderPath ?? '',
        savedPath: settings.cs16FolderPath,
        configFilePath: settings.configFilePath,
        status: 'idle',
        requiresGameSetup: false,
        notice: 'Counter-Strike path saved.'
      })
    } catch (error) {
      set({ status: 'idle', error: message(error) })
    }
  },

  promptToConfigureForMatch: () => {
    set({
      folderPath: '',
      savedPath: null,
      error: null,
      requiresGameSetup: true,
      notice: 'Set up your Counter-Strike 1.6 folder before reconnecting to the match.'
    })
  }
}))
