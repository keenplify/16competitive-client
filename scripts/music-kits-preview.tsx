declare const __MUSIC_PREVIEW_MODEL_ROOT__: string

// Isolated visual fixture using the production component. No real purchases or accounts.
import { createRoot } from 'react-dom/client'
import { ProfilePage } from '../src/renderer/src/features/profile/ProfilePage'
import { useNavigationStore } from '../src/renderer/src/features/navigation/navigation.store'
import { useLauncherThemeStore } from '../src/renderer/src/features/settings/launcher-theme.store'
import { useMusicKitsStore } from '../src/renderer/src/features/skins/music-kits.store'
import { useAuthStore } from '../src/renderer/src/features/auth/auth.store'
import type { MusicKitSnapshot } from '../src/shared/music-kits'
import '../src/renderer/src/assets/main.css'

const sample: MusicKitSnapshot = {
  ownedIds: ['quake', 'arena-demo'],
  equipped: { ct: 'quake', t: 'quake' },
  kits: [
    {
      id: 'quake',
      name: 'Quake',
      pricePoints: 0,
      enabled: true,
      logoPath: null,
      sounds: {},
      logoUrl: '/scripts/music-kit-sample-logo.svg'
    },
    {
      id: 'arena-demo',
      name: 'Arena Announcer · sample',
      pricePoints: 2500,
      enabled: true,
      logoPath: null,
      sounds: {},
      logoUrl: '/scripts/music-kit-sample-logo.svg'
    }
  ]
}
window.api = {
  matchHistory: { getPlayerProfile: async () => null },
  models: {
    readThumbnail: async () => null,
    writeThumbnail: async () => {},
    read: async (path: string) => {
      const lobby = /(?:lobby\/|player\/)([a-z0-9]+)(?:_lobby\.mdl|\/[^/]+\.mdl)$/.exec(path)?.[1]
      const url = lobby
        ? `/resources/lobby-models/${lobby}_lobby.mdl`
        : `${__MUSIC_PREVIEW_MODEL_ROOT__}/${path.replace(/^models\//, '')}`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Fixture model unavailable')
      return response.arrayBuffer()
    }
  },
  skins: {
    mine: async () => [],
    musicKits: async () => {
      if (new URLSearchParams(location.search).get('state') === 'error')
        throw new Error('Preview failure')
      return structuredClone(sample)
    },
    musicBuy: async (id: string) => {
      sample.ownedIds.push(id)
      return { points: 5000 }
    },
    musicEquip: async (id: string | null) => {
      sample.equipped = { ct: id, t: id }
    },
    musicPreview: async () => {
      throw new Error('This visual fixture does not play sample audio')
    }
  }
} as unknown as typeof window.api
useAuthStore.setState({
  session: {
    expiresAt: '2099-01-01T00:00:00Z',
    player: {
      id: 'preview',
      username: 'Preview',
      email: null,
      mmr: 1000,
      points: 7500,
      flagCountryCode: null,
      createdAt: '2026-01-01T00:00:00Z',
      hasPassword: true,
      requiresUsernameSetup: false,
      usernameChangeAvailableAt: null
    }
  }
})
useLauncherThemeStore.getState().setTheme('vgui2')
document.documentElement.dataset.launcherTheme = 'vgui2'
useNavigationStore.getState().setProfileTab('skins')
const style = document.createElement('style')
style.textContent =
  ":root:root[data-launcher-theme='vgui2']{--vgui-face:#203f5f;--vgui-inset:#07131f;--vgui-light:#b7c8db;--vgui-dark:#04101b;--vgui-text:#eef4fa;--vgui-accent:#ff941f;--color-white:#eef4fa;--color-neutral-300:#c6d3e2;--color-neutral-950:#07131f}"
document.head.append(style)
createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen p-4 text-white" style={{ background: '#203f5f' }}>
    <ProfilePage />
  </main>
)
if (new URLSearchParams(location.search).get('filter') === 'music')
  useMusicKitsStore.getState().setFilterTeam('ct')
