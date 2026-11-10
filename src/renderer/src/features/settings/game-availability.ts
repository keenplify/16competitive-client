import { usePartnerGamePreferenceStore } from './partner-game-preference.store'
import type { GameSettings } from '../../../../shared/game-settings'
import type { GameVersion } from '../../../../shared/game-version'
import { isWebRuntime } from '../../web-runtime'

/** Revalidate both adapters. A missing optional game never blocks the other. */
export async function configuredGames(
  settings?: Pick<GameSettings, 'cs16ExecutablePath' | 'cs16FolderPath'>
): Promise<GameVersion[]> {
  if (isWebRuntime()) {
    const helper = await window.api.matchmaking
      .nativeHelperSettings?.({ action: 'get' })
      .catch(() => null)
    const games: GameVersion[] = [
      ...(helper?.cs16FolderPath ? ['cs16' as const] : []),
      ...(helper?.cs13FolderPath ? ['cs13' as const] : [])
    ]
    const preferred = usePartnerGamePreferenceStore.getState().game
    return preferred ? games.filter((game) => game === preferred) : games
  }
  const [modern, legacy] = await Promise.allSettled([
    settings ? Promise.resolve(settings) : window.api.gameSettings.get(),
    window.api.legacyGame.get()
  ])
  const games: GameVersion[] = []
  if (modern.status === 'fulfilled' && modern.value.cs16ExecutablePath) games.push('cs16')
  if (legacy.status === 'fulfilled' && legacy.value.ok && legacy.value.value.installation)
    games.push('cs13')
  return games
}
