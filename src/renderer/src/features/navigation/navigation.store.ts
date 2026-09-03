import { create } from 'zustand'

export type LobbyPageId =
  'lobby' | 'play' | 'leaderboard' | 'store' | 'news' | 'settings' | 'profile'

export type ProfileTabId = 'matches' | 'skins'

interface NavigationState {
  page: LobbyPageId
  profileTab: ProfileTabId
  navigate: (page: LobbyPageId) => void
  setProfileTab: (tab: ProfileTabId) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  page: 'lobby',
  profileTab: 'matches',
  navigate: (page) => set({ page }),
  setProfileTab: (profileTab) => set({ profileTab })
}))
