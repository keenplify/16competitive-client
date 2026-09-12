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

const executableSelectionHelp = (): string => {
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('mac')) {
    return 'macOS uses Wine: select the Windows hl.exe inside your Wine prefix, usually under ~/.wine/drive_c/Program Files (x86)/Steam/steamapps/common/Half-Life.'
  }
  if (userAgent.includes('windows')) {
    return 'Game location: select hl.exe inside the Steam Half-Life folder.'
  }
  return 'Game location: select hl.sh (recommended) or hl_linux inside the Steam Half-Life folder.'
}

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
        status: 'idle',
        notice: executableSelectionHelp()
      })
    } catch (error) {
      set({ status: 'idle', error: message(error), notice: executableSelectionHelp() })
    }
  },

  choose: async () => {
    set({ status: 'choosing', error: null, notice: executableSelectionHelp() })
    try {
      const executablePath = await window.api.gameSettings.chooseExecutable()
      set({
        status: 'idle',
        ...(executablePath ? { executablePath } : {}),
        notice: executableSelectionHelp()
      })
    } catch (error) {
      set({ status: 'idle', error: message(error), notice: executableSelectionHelp() })
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
        notice: `Counter-Strike path saved. ${executableSelectionHelp()}`
      })
    } catch (error) {
      set({ status: 'idle', error: message(error), notice: executableSelectionHelp() })
    }
  }
}))
