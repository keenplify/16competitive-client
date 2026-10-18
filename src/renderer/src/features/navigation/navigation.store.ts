import { create } from 'zustand'

export type LobbyPageId =
  'demos' | 'lobby' | 'play' | 'leaderboard' | 'store' | 'communities' | 'news' | 'settings' | 'profile'

export type ProfileTabId = 'overview' | 'matches' | 'skins' | 'operation'

interface NavigationState {
  page: LobbyPageId
  profileTab: ProfileTabId
  navigate: (page: LobbyPageId) => void
  setProfileTab: (tab: ProfileTabId) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  page: 'lobby',
  profileTab: 'overview',
  navigate: (page) => set({ page }),
  setProfileTab: (profileTab) => set({ profileTab })
}))
