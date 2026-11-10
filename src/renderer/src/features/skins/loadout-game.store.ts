import { usePartnerGamePreferenceStore } from '../settings/partner-game-preference.store'
import { create } from 'zustand'
import type { GameVersion } from '../../../../shared/game-version'
import { configuredGames } from '../settings/game-availability'

export const useLoadoutGameStore = create<{
  game: GameVersion
  available: GameVersion[]
  loading: boolean
  select: (game: GameVersion) => void
  load: () => Promise<void>
}>((set, get) => ({
  game: 'cs16',
  available: [],
  loading: true,
  select: (game) => {
    if (get().available.includes(game)) set({ game })
  },
  load: async () => {
    const available = await configuredGames()
    set((state) => ({
      available,
      loading: false,
      game:
        usePartnerGamePreferenceStore.getState().game ??
        (available.includes(state.game) ? state.game : (available[0] ?? 'cs16'))
    }))
  }
}))

usePartnerGamePreferenceStore.subscribe((state, previous) => {
  if (state.game !== previous.game || state.accountId !== previous.accountId) {
    useLoadoutGameStore.setState({ game: state.game ?? 'cs16', available: [], loading: true })
    void useLoadoutGameStore.getState().load()
  }
})
