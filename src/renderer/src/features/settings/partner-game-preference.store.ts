import { create } from 'zustand'
import type { GameVersion } from '../../../../shared/game-version'

const key = '16c.partner-game-preference.v1'
export const usePartnerGamePreferenceStore = create<{
  accountId: string | null
  game: GameVersion | null
  apply: (accountId: string, game: GameVersion | null) => void
}>((set) => ({
  accountId: null,
  game: null,
  apply: (accountId, game) => {
    set({ accountId, game })
    try {
      if (game) sessionStorage.setItem(key, JSON.stringify({ accountId, game }))
      else sessionStorage.removeItem(key)
    } catch {
      /* Storage is optional; the current tab still uses the preference. */
    }
  }
}))
export function restorePartnerGamePreference(accountId: string | null): void {
  let game: GameVersion | null = null
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (saved?.accountId === accountId && ['cs13', 'cs16'].includes(saved.game)) game = saved.game
    if (!accountId) sessionStorage.removeItem(key)
  } catch {
    /* Ignore unavailable or malformed optional preferences. */
  }
  usePartnerGamePreferenceStore.setState({ accountId, game })
}
