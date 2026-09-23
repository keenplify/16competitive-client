export const GAME_SETTINGS_CHANNELS = {
  get: 'game-settings:get',
  chooseFolder: 'game-settings:choose-folder',
  save: 'game-settings:save',
  setVoicePttKey: 'game-settings:set-voice-ptt-key',
  getAssetSyncStatus: 'game-settings:get-asset-sync-status',
  syncAssets: 'game-settings:sync-assets',
  assetSyncProgress: 'game-settings:asset-sync-progress'
} as const

export interface GameSettings {
  cs16ExecutablePath: string | null
  cs16FolderPath: string | null
  configFilePath: string
  voicePttKey: string
  voicePttKeys: string[]
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
  save(folderPath: string): Promise<GameSettings>
  setVoicePttKey(key: string): Promise<GameSettings>
  getAssetSyncStatus(): Promise<SkinAssetSyncProgress>
  syncAssets(mode: SkinAssetSyncMode): Promise<void>
  onAssetSyncProgress(listener: (progress: SkinAssetSyncProgress) => void): () => void
}
