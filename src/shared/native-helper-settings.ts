import type { GameDisplayPreferences, GameResolution } from './game-display'

export interface NativeHelperSettings {
  cs13FolderPath: string | null
  cs16FolderPath: string | null
  display: GameDisplayPreferences
  currentDisplayResolution: GameResolution
  fastSwitchEnabled: boolean
  enhancementsEnabled: boolean
  lightweightHud: boolean
  killCardsEnabled: boolean
}

export type NativeHelperSettingsRequest =
  | { action: 'get' }
  | { action: 'choose'; game: 'cs13' | 'cs16' }
  | { action: 'save'; settings: Omit<NativeHelperSettings, 'cs13FolderPath' | 'cs16FolderPath'> }
