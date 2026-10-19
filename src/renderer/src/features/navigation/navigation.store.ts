import { create } from 'zustand'

export type LobbyPageId =
  | 'demos'
  | 'lobby'
  | 'play'
  | 'leaderboard'
  | 'store'
  | 'communities'
  | 'news'
  | 'settings'
  | 'profile'

export type ProfileTabId = 'overview' | 'matches' | 'skins' | 'operation'

interface NavigationState {
  page: LobbyPageId
  profileTab: ProfileTabId
  settingsTarget: 'discord' | null
  navigate: (page: LobbyPageId) => void
  openDiscordSettings: () => void
  clearSettingsTarget: () => void
  setProfileTab: (tab: ProfileTabId) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  page: 'lobby',
  profileTab: 'overview',
  settingsTarget: null,
  navigate: (page) => set({ page, settingsTarget: null }),
  openDiscordSettings: () => set({ page: 'settings', settingsTarget: 'discord' }),
  clearSettingsTarget: () => set({ settingsTarget: null }),
  setProfileTab: (profileTab) => set({ profileTab })
}))
