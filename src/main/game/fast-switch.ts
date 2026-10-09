import type { GameSettings } from '../../shared/game-settings'

type FastSwitchSettings = Pick<GameSettings, 'fastSwitchManaged' | 'fastSwitchEnabled'>

/** One preference representation for the config and the native NextClient handoff. */
export function fastSwitchPreference(settings: FastSwitchSettings): '0' | '1' | 'inherit' {
  return settings.fastSwitchManaged ? (settings.fastSwitchEnabled ? '1' : '0') : 'inherit'
}

export function fastSwitchCommands(settings: FastSwitchSettings): string[] {
  const value = fastSwitchPreference(settings)
  return value === 'inherit' ? [] : [`hud_fastswitch "${value}"`]
}
