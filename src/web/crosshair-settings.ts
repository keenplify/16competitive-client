import {
  parseCrosshairProfile,
  serializeCrosshairConfig,
  type CrosshairProfile
} from '../shared/crosshair'
import type { GameSettings } from '../shared/game-settings'

/** Account settings remain available when the optional web helper is offline. */
export async function saveBrowserCrosshair(
  profile: CrosshairProfile,
  saveAccount: (config: string) => Promise<unknown>,
  saveLocal: (config: string) => Promise<GameSettings>,
  fallbackSettings: () => GameSettings
): Promise<GameSettings> {
  const parsed = parseCrosshairProfile(profile)
  const config = serializeCrosshairConfig(parsed)
  await saveAccount(config.trim())
  let settings: GameSettings
  try {
    settings = await saveLocal(config)
  } catch {
    settings = fallbackSettings()
  }
  return { ...settings, crosshair: parsed }
}
