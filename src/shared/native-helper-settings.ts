import type { GameDisplayPreferences, GameResolution } from './game-display'
import type { DeviceStatus } from './anti-cheat'

export interface NativeHelperReadiness {
  competitiveReady: boolean
  games?: { cs13: boolean; cs16: boolean }
  device: DeviceStatus
}

export interface NativeHelperSettings {
  managedInstallations?: boolean
  helperVersion?: string
  cs13FolderPath: string | null
  cs16FolderPath: string | null
  display: GameDisplayPreferences
  currentDisplayResolution: GameResolution
  fastSwitchEnabled: boolean
  enhancementsEnabled: boolean
  lightweightHud: boolean
  killCardsEnabled: boolean
  crosshairConfig: string | null
  playerPingKey: import('./player-ping').PlayerPingKey
  nextClientDetected: boolean
  platform: 'win32' | 'linux'
  voice?: {
    enabled: boolean
    openMic: boolean
    peers: Record<string, { muted: boolean; volume: number }>
  }
  voicePttKeys: [string, string]
}

export type NativeHelperSettingsRequest =
  | { action: 'get' }
  | { action: 'choose'; game: 'cs13' | 'cs16' }
  | { action: 'select'; game: 'cs13' | 'cs16'; folderPath: string }
  | {
      action: 'save'
      settings: Omit<
        NativeHelperSettings,
        | 'cs13FolderPath'
        | 'cs16FolderPath'
        | 'nextClientDetected'
        | 'platform'
        | 'managedInstallations'
      >
    }
