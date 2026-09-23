import { create } from 'zustand'

interface GameSettingsState {
  folderPath: string
  savedPath: string | null
  configFilePath: string | null
  status: 'idle' | 'loading' | 'choosing' | 'saving'
  error: string | null
  notice: string | null
  requiresGameSetup: boolean
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

  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const settings = await window.api.gameSettings.get()
      set({
        folderPath: settings.cs16FolderPath ?? '',
        savedPath: settings.cs16FolderPath,
        configFilePath: settings.configFilePath,
        status: 'idle',
        requiresGameSetup: !settings.cs16ExecutablePath
      })
    } catch (error) {
      set({ status: 'idle', error: message(error) })
    }
  },

  choose: async () => {
    set({ status: 'choosing', error: null, notice: null })
    try {
      const folderPath = await window.api.gameSettings.chooseFolder()
      set({ status: 'idle', ...(folderPath ? { folderPath } : {}) })
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
