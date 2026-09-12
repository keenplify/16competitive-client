import { create } from 'zustand'

interface GameSettingsState {
  executablePath: string
  savedPath: string | null
  configFilePath: string | null
  status: 'idle' | 'loading' | 'choosing' | 'saving'
  error: string | null
  notice: string | null
  load: () => Promise<void>
  choose: () => Promise<void>
  save: () => Promise<void>
}

const message = (error: unknown): string =>
  error instanceof Error
    ? error.message.replace(/^Error invoking remote method '.+?': Error: /, '')
    : 'Request failed.'

export const useGameSettingsStore = create<GameSettingsState>((set, get) => ({
  executablePath: '',
  savedPath: null,
  configFilePath: null,
  status: 'idle',
  error: null,
  notice: null,

  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const settings = await window.api.gameSettings.get()
      set({
        executablePath: settings.cs16ExecutablePath ?? '',
        savedPath: settings.cs16ExecutablePath,
        configFilePath: settings.configFilePath,
        status: 'idle'
      })
    } catch (error) {
      set({ status: 'idle', error: message(error) })
    }
  },

  choose: async () => {
    set({ status: 'choosing', error: null, notice: null })
    try {
      const executablePath = await window.api.gameSettings.chooseExecutable()
      set({ status: 'idle', ...(executablePath ? { executablePath } : {}) })
    } catch (error) {
      set({ status: 'idle', error: message(error) })
    }
  },

  save: async () => {
    const executablePath = get().executablePath
    set({ status: 'saving', error: null, notice: null })
    try {
      const settings = await window.api.gameSettings.save(executablePath)
      set({
        executablePath: settings.cs16ExecutablePath ?? '',
        savedPath: settings.cs16ExecutablePath,
        configFilePath: settings.configFilePath,
        status: 'idle',
        notice: 'Counter-Strike path saved.'
      })
    } catch (error) {
      set({ status: 'idle', error: message(error) })
    }
  }
}))
