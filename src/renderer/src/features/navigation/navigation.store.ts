import { create } from 'zustand'

export type LobbyPageId =
  'lobby' | 'play' | 'leaderboard' | 'store' | 'news' | 'settings' | 'profile'

interface NavigationState {
  page: LobbyPageId
  navigate: (page: LobbyPageId) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  page: 'lobby',
  navigate: (page) => set({ page })
}))
