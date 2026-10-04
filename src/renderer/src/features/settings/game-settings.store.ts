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
  nextClientDetected: boolean
  nextClientIntegrationEnabled: boolean
  nextClientIntegrationDisabledReason: string | null
  fastSwitchEnabled: boolean
  killCardsEnabled: boolean
  setCrosshair: (profile: CrosshairProfile) => Promise<void>
  setNextClientIntegration: (enabled: boolean) => Promise<void>
  setFastSwitch: (enabled: boolean) => Promise<void>
  setKillCards: (enabled: boolean) => Promise<void>
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
  nextClientDetected: false,
  nextClientIntegrationEnabled: true,
  nextClientIntegrationDisabledReason: null,
  fastSwitchEnabled: true,
  killCardsEnabled: true,

  setCrosshair: async (profile) => {
    const settings = await window.api.gameSettings.setCrosshair(profile)
    set({ crosshair: settings.crosshair })
  },

  setNextClientIntegration: async (enabled) => {
    try {
      const settings = await window.api.gameSettings.setNextClientIntegration(enabled)
      set({
        nextClientIntegrationEnabled: settings.nextClientIntegrationEnabled,
        nextClientIntegrationDisabledReason: settings.nextClientIntegrationDisabledReason,
        notice: enabled ? 'In-game enhancements enabled.' : 'In-game enhancements disabled.',
        error: null
      })
    } catch (error) {
      set({ error: message(error) })
    }
  },

  setFastSwitch: async (enabled) => {
    try {
      const settings = await window.api.gameSettings.setFastSwitch(enabled)
      set({ fastSwitchEnabled: settings.fastSwitchEnabled, error: null })
    } catch (error) {
      set({ error: message(error) })
    }
  },

  setKillCards: async (enabled) => {
    try {
      const settings = await window.api.gameSettings.setKillCards(enabled)
      set({ killCardsEnabled: settings.killCardsEnabled, error: null })
    } catch (error) {
      set({ error: message(error) })
    }
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
        crosshair: settings.crosshair,
        nextClientDetected: settings.nextClientDetected,
        nextClientIntegrationEnabled: settings.nextClientIntegrationEnabled,
        nextClientIntegrationDisabledReason: settings.nextClientIntegrationDisabledReason,
        fastSwitchEnabled: settings.fastSwitchEnabled,
        killCardsEnabled: settings.killCardsEnabled
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
        crosshair: settings.crosshair,
        nextClientDetected: settings.nextClientDetected,
        nextClientIntegrationEnabled: settings.nextClientIntegrationEnabled,
        nextClientIntegrationDisabledReason: settings.nextClientIntegrationDisabledReason,
        fastSwitchEnabled: settings.fastSwitchEnabled,
        killCardsEnabled: settings.killCardsEnabled,
        status: 'idle',
        requiresGameSetup: false,
        notice: settings.nextClientDetected
          ? 'NextClient detected. Use NextClient settings to adjust your crosshair.'
          : 'Counter-Strike path saved.'
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
