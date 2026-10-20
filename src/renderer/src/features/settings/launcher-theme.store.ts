import { create } from 'zustand'

export type LauncherTheme = 'latest' | 'vgui2' | 'community'
const preferenceKey = '16competitive.launcher-theme'

function readTheme(): LauncherTheme {
  try {
    const saved = window.localStorage.getItem(preferenceKey)
    return saved === 'vgui2' || saved === 'community' ? saved : 'latest'
  } catch {
    return 'latest'
  }
}

interface LauncherThemeState {
  theme: LauncherTheme
  hasPreference: boolean
  setTheme: (theme: LauncherTheme) => void
  offerCommunityDefault: () => void
}

function hasSavedPreference(): boolean {
  try {
    return ['latest', 'vgui2', 'community'].includes(
      window.localStorage.getItem(preferenceKey) ?? ''
    )
  } catch {
    return false
  }
}

export const useLauncherThemeStore = create<LauncherThemeState>((set, get) => ({
  theme: readTheme(),
  hasPreference: hasSavedPreference(),
  setTheme: (theme) => {
    try {
      window.localStorage.setItem(preferenceKey, theme)
    } catch {
      // Storage may be unavailable; the choice still applies for this session.
    }
    set({ theme, hasPreference: true })
  },
  offerCommunityDefault: () => {
    // An asynchronously arriving community must never replace an explicit choice.
    if (!get().hasPreference) get().setTheme('community')
  }
}))

// Apply before the first React paint, including after a launcher restart.
useLauncherThemeStore.subscribe(({ theme }) => {
  document.documentElement.dataset.launcherTheme = theme
})
document.documentElement.dataset.launcherTheme = useLauncherThemeStore.getState().theme
