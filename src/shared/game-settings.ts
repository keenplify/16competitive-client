export const GAME_SETTINGS_CHANNELS = {
  get: 'game-settings:get',
  chooseExecutable: 'game-settings:choose-executable',
  save: 'game-settings:save',
  getAssetSyncStatus: 'game-settings:get-asset-sync-status',
  syncAssets: 'game-settings:sync-assets',
  assetSyncProgress: 'game-settings:asset-sync-progress'
} as const

export interface GameSettings {
  cs16ExecutablePath: string | null
  configFilePath: string
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
  chooseExecutable(): Promise<string | null>
  save(executablePath: string): Promise<GameSettings>
  getAssetSyncStatus(): Promise<SkinAssetSyncProgress>
  syncAssets(mode: SkinAssetSyncMode): Promise<void>
  onAssetSyncProgress(listener: (progress: SkinAssetSyncProgress) => void): () => void
}
