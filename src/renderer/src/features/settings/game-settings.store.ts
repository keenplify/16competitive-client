import { DEFAULT_PLAYER_PING_KEY, type PlayerPingKey } from '../../../../shared/player-ping'
import { create } from 'zustand'
import { DEFAULT_CROSSHAIR, type CrosshairProfile } from '../../../../shared/crosshair'
import type {
  ClientType,
  NextClientInstallProgress,
  SetupMode
} from '../../../../shared/game-settings'

type NextClientInstallStatus =
  | 'idle'
  | 'checking_source'
  | 'downloading'
  | 'extracting'
  | 'launching'
  | 'waiting'
  | 'detecting'
  | 'ready'
  | 'error'

let nextClientDetectionRun = 0

interface GameSettingsState {
  folderPath: string
  savedPath: string | null
  configFilePath: string | null
  status: 'idle' | 'loading' | 'choosing' | 'saving'
  loaded: boolean
  error: string | null
  notice: string | null
  requiresGameSetup: boolean
  crosshair: CrosshairProfile
  nextClientDetected: boolean
  nextClientIntegrationEnabled: boolean
  nextClientIntegrationDisabledReason: string | null
  playerPingKey: PlayerPingKey
  pingSaving: boolean
  pingSaveFailed: boolean
  setPlayerPingKey: (key: PlayerPingKey) => Promise<void>
  fastSwitchEnabled: boolean
  fastSwitchManaged: boolean
  lightweightHud: boolean
  lightweightHudStatus: 'idle' | 'saving' | 'error'
  killCardsEnabled: boolean
  setupCompleted: boolean
  setupMode: SetupMode | null
  clientType: ClientType | null
  platform: 'win32' | 'linux' | 'other'
  nextClientInstallStatus: NextClientInstallStatus
  nextClientInstallProgress: NextClientInstallProgress | null
  nextClientInstallError: string | null
  setCrosshair: (profile: CrosshairProfile) => Promise<void>
  setNextClientIntegration: (enabled: boolean) => Promise<void>
  setFastSwitch: (enabled: boolean) => Promise<void>
  setLightweightHud: (enabled: boolean) => Promise<void>
  setKillCards: (enabled: boolean) => Promise<void>
  load: () => Promise<void>
  choose: () => Promise<void>
  save: () => Promise<void>
  completeSetup: (mode: SetupMode) => Promise<boolean>
  installNextClient: () => Promise<void>
  detectNextClient: () => Promise<boolean>
  cancelNextClientDetection: () => void
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
  loaded: false,
  error: null,
  notice: null,
  requiresGameSetup: false,
  crosshair: DEFAULT_CROSSHAIR,
  nextClientDetected: false,
  nextClientIntegrationEnabled: true,
  nextClientIntegrationDisabledReason: null,
  playerPingKey: DEFAULT_PLAYER_PING_KEY,
  pingSaving: false,
  pingSaveFailed: false,
  fastSwitchEnabled: true,
  fastSwitchManaged: true,
  lightweightHud: false,
  lightweightHudStatus: 'idle',
  killCardsEnabled: true,
  setupCompleted: false,
  setupMode: null,
  clientType: null,
  platform: 'other',
  nextClientInstallStatus: 'idle',
  nextClientInstallProgress: null,
  nextClientInstallError: null,

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

  setPlayerPingKey: async (key) => {
    if (get().pingSaving) return
    set({ pingSaving: true, pingSaveFailed: false })
    try {
      const settings = await window.api.gameSettings.setPlayerPingKey(key)
      set({ playerPingKey: settings.playerPingKey })
    } catch {
      set({ pingSaveFailed: true })
    } finally {
      set({ pingSaving: false })
    }
  },

  setFastSwitch: async (enabled) => {
    try {
      const settings = await window.api.gameSettings.setFastSwitch(enabled)
      set({
        playerPingKey: settings.playerPingKey,
        fastSwitchEnabled: settings.fastSwitchEnabled,
        fastSwitchManaged: settings.fastSwitchManaged,
        error: null
      })
    } catch (error) {
      set({ error: message(error) })
    }
  },

  setLightweightHud: async (enabled) => {
    set({ lightweightHudStatus: 'saving' })
    try {
      const settings = await window.api.gameSettings.setLightweightHud(enabled)
      set({ lightweightHud: settings.lightweightHud, lightweightHudStatus: 'idle' })
    } catch {
      set({ lightweightHudStatus: 'error' })
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
        loaded: true,
        requiresGameSetup: !settings.cs16ExecutablePath,
        crosshair: settings.crosshair,
        nextClientDetected: settings.nextClientDetected,
        nextClientIntegrationEnabled: settings.nextClientIntegrationEnabled,
        nextClientIntegrationDisabledReason: settings.nextClientIntegrationDisabledReason,
        playerPingKey: settings.playerPingKey,
        fastSwitchEnabled: settings.fastSwitchEnabled,
        fastSwitchManaged: settings.fastSwitchManaged,
        lightweightHud: settings.lightweightHud,
        killCardsEnabled: settings.killCardsEnabled,
        setupCompleted: settings.setupCompleted,
        setupMode: settings.setupMode,
        clientType: settings.clientType,
        platform: settings.platform
      })
    } catch (error) {
      set({ status: 'idle', loaded: true, error: message(error) })
    }
  },

  choose: async () => {
    nextClientDetectionRun += 1
    set({ nextClientInstallStatus: 'idle' })
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
        playerPingKey: settings.playerPingKey,
        fastSwitchEnabled: settings.fastSwitchEnabled,
        fastSwitchManaged: settings.fastSwitchManaged,
        lightweightHud: settings.lightweightHud,
        killCardsEnabled: settings.killCardsEnabled,
        setupCompleted: settings.setupCompleted,
        setupMode: settings.setupMode,
        clientType: settings.clientType,
        platform: settings.platform,
        status: 'idle',
        requiresGameSetup: false,
        notice: 'Counter-Strike path saved.'
      })
    } catch (error) {
      set({ status: 'idle', error: message(error) })
    }
  },

  completeSetup: async (mode) => {
    set({ status: 'saving', error: null })
    try {
      const settings = await window.api.gameSettings.completeSetup(mode)
      set({
        status: 'idle',
        setupCompleted: settings.setupCompleted,
        setupMode: settings.setupMode,
        clientType: settings.clientType,
        nextClientIntegrationEnabled: settings.nextClientIntegrationEnabled,
        playerPingKey: settings.playerPingKey,
        fastSwitchEnabled: settings.fastSwitchEnabled,
        fastSwitchManaged: settings.fastSwitchManaged,
        lightweightHud: settings.lightweightHud,
        killCardsEnabled: settings.killCardsEnabled,
        error: null
      })
      return true
    } catch (error) {
      set({ status: 'idle', error: message(error) })
      return false
    }
  },

  installNextClient: async () => {
    if (get().platform !== 'win32') {
      set({
        nextClientInstallStatus: 'error',
        nextClientInstallError: 'NextClient requires Windows.'
      })
      return
    }
    const run = ++nextClientDetectionRun
    set({
      nextClientInstallStatus: 'checking_source',
      nextClientInstallProgress: null,
      nextClientInstallError: null
    })
    const unsubscribe = window.api.gameSettings.onNextClientInstallProgress((progress) => {
      if (run !== nextClientDetectionRun) return
      set({ nextClientInstallStatus: progress.phase, nextClientInstallProgress: progress })
    })
    try {
      await window.api.gameSettings.installNextClient()
      if (run !== nextClientDetectionRun) return
      set({ nextClientInstallStatus: 'waiting' })
      for (let attempt = 0; attempt < 200 && run === nextClientDetectionRun; attempt += 1) {
        if (await get().detectNextClient()) return
        if (get().nextClientInstallStatus === 'error') return
        await new Promise((resolve) => window.setTimeout(resolve, 3_000))
      }
      if (run === nextClientDetectionRun) {
        set({
          nextClientInstallStatus: 'error',
          nextClientInstallError: 'NextClient was not detected. Choose its installation folder.'
        })
      }
    } catch (error) {
      if (run === nextClientDetectionRun) {
        set({ nextClientInstallStatus: 'error', nextClientInstallError: message(error) })
      }
    } finally {
      unsubscribe()
    }
  },

  detectNextClient: async () => {
    if (get().nextClientInstallStatus === 'detecting') return false
    set({ nextClientInstallStatus: 'detecting', nextClientInstallError: null })
    try {
      const folder = await window.api.gameSettings.detectNextClient()
      if (!folder) {
        set({ nextClientInstallStatus: 'waiting' })
        return false
      }
      set({ folderPath: folder })
      await get().save()
      if (
        get().error ||
        !get().nextClientDetected ||
        get().savedPath?.toLowerCase() !== folder.toLowerCase()
      ) {
        throw new Error(get().error ?? 'NextClient installation could not be selected.')
      }
      nextClientDetectionRun += 1
      set({ nextClientInstallStatus: 'ready', nextClientInstallError: null })
      return true
    } catch (error) {
      set({ nextClientInstallStatus: 'error', nextClientInstallError: message(error) })
      return false
    }
  },

  cancelNextClientDetection: () => {
    const status = get().nextClientInstallStatus
    nextClientDetectionRun += 1
    if (['checking_source', 'downloading', 'extracting', 'launching'].includes(status)) {
      void window.api.gameSettings.cancelNextClientInstall()
    }
    if (status !== 'ready') {
      set({ nextClientInstallStatus: 'idle' })
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
