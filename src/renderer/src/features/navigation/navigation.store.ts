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

export type ProfileTabId = 'overview' | 'matches' | 'skins' | 'inventory' | 'operation'

export type PurchasedItem = { kind: 'skin' | 'sticker'; id: string }
interface NavigationState {
  purchasedItem: PurchasedItem | null
  openPurchasedItem: (item: PurchasedItem) => void
  page: LobbyPageId
  profileTab: ProfileTabId
  storeStickerSearch: string | null
  openStickerStore: (name: string) => void
  settingsTarget: 'discord' | null
  navigate: (page: LobbyPageId) => void
  openDiscordSettings: () => void
  clearSettingsTarget: () => void
  setProfileTab: (tab: ProfileTabId) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  page:
    typeof window !== 'undefined' && window.location.hash === '#settings' ? 'settings' : 'lobby',
  profileTab: 'overview',
  purchasedItem: null,
  openPurchasedItem: (item) =>
    set({
      page: 'profile',
      profileTab: item.kind === 'sticker' ? 'inventory' : 'skins',
      purchasedItem: item
    }),
  storeStickerSearch: null,
  openStickerStore: (name) =>
    set({ page: 'store', storeStickerSearch: name, settingsTarget: null }),
  settingsTarget: null,
  navigate: (page) => set({ page, settingsTarget: null, storeStickerSearch: null }),
  openDiscordSettings: () => set({ page: 'settings', settingsTarget: 'discord' }),
  clearSettingsTarget: () => set({ settingsTarget: null }),
  setProfileTab: (profileTab) => set({ profileTab })
}))
