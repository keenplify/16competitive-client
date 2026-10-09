import type { PlayerPingKey } from './player-ping'
import type { CrosshairProfile } from './crosshair'

export const GAME_SETTINGS_CHANNELS = {
  get: 'game-settings:get',
  chooseFolder: 'game-settings:choose-folder',
  installNextClient: 'game-settings:install-nextclient',
  cancelNextClientInstall: 'game-settings:cancel-nextclient-install',
  detectNextClient: 'game-settings:detect-nextclient',
  nextClientInstallProgress: 'game-settings:nextclient-install-progress',
  save: 'game-settings:save',
  setVoicePttKey: 'game-settings:set-voice-ptt-key',
  setCrosshair: 'game-settings:set-crosshair',
  setNextClientIntegration: 'game-settings:set-nextclient-integration',
  setFastSwitch: 'game-settings:set-fast-switch',
  setPlayerPingKey: 'game-settings:set-player-ping-key',
  setKillCards: 'game-settings:set-kill-cards',
  completeSetup: 'game-settings:complete-setup',
  getAssetSyncStatus: 'game-settings:get-asset-sync-status',
  syncAssets: 'game-settings:sync-assets',
  assetSyncProgress: 'game-settings:asset-sync-progress'
} as const

export type SetupMode = 'recommended' | 'custom'
export type ClientType = 'steam' | 'nextclient' | 'standalone'

export interface GameSettings {
  cs16ExecutablePath: string | null
  cs16FolderPath: string | null
  configFilePath: string
  voicePttKey: string
  voicePttKeys: string[]
  playerPingKey: PlayerPingKey
  crosshair: CrosshairProfile
  nextClientDetected: boolean
  nextClientIntegrationEnabled: boolean
  nextClientIntegrationDisabledReason: string | null
  fastSwitchEnabled: boolean
  fastSwitchManaged: boolean
  killCardsEnabled: boolean
  setupCompleted: boolean
  setupMode: SetupMode | null
  clientType: ClientType | null
  platform: 'win32' | 'linux' | 'other'
}

export interface NextClientInstallProgress {
  phase: 'checking_source' | 'downloading' | 'extracting' | 'launching'
  downloadedBytes: number
  totalBytes: number | null
}

export type SkinAssetSyncMode = 'download' | 'repair'

export interface SkinAssetSyncProgress {
  status: 'idle' | 'syncing' | 'ready' | 'error'
  completedFiles: number
  totalFiles: number
  message?: string
}

export interface GameSettingsApi {
  get(): Promise<GameSettings>
  chooseFolder(): Promise<string | null>
  installNextClient(): Promise<void>
  cancelNextClientInstall(): Promise<void>
  detectNextClient(): Promise<string | null>
  onNextClientInstallProgress(listener: (progress: NextClientInstallProgress) => void): () => void
  save(folderPath: string): Promise<GameSettings>
  setVoicePttKey(key: string): Promise<GameSettings>
  setCrosshair(profile: CrosshairProfile): Promise<GameSettings>
  setNextClientIntegration(enabled: boolean): Promise<GameSettings>
  setFastSwitch(enabled: boolean): Promise<GameSettings>
  setPlayerPingKey(key: PlayerPingKey): Promise<GameSettings>
  setKillCards(enabled: boolean): Promise<GameSettings>
  completeSetup(mode: SetupMode): Promise<GameSettings>
  getAssetSyncStatus(): Promise<SkinAssetSyncProgress>
  syncAssets(mode: SkinAssetSyncMode): Promise<void>
  onAssetSyncProgress(listener: (progress: SkinAssetSyncProgress) => void): () => void
}
