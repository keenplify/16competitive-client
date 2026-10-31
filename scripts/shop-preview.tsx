declare const __MUSIC_PREVIEW_MODEL_ROOT__: string
// Isolated layout preview with sample data. No purchases or live account access.
import { createRoot } from 'react-dom/client'
import { LobbySocialSidebar } from '../src/renderer/src/features/party/LobbySocialSidebar'
import { useFriendsStore } from '../src/renderer/src/features/friends/friends.store'
import { ShopPage } from '../src/renderer/src/features/skins/ShopPage'
import { LauncherWindow } from '../src/renderer/src/components/ui/LauncherWindow'
import { LobbyNavigation } from '../src/renderer/src/components/ui/lobby/Navigation'
import { useAuthStore } from '../src/renderer/src/features/auth/auth.store'
import { useLauncherThemeStore } from '../src/renderer/src/features/settings/launcher-theme.store'
import { I18nRuntime } from '../src/renderer/src/features/i18n/I18nRuntime'
import { useLanguageStore } from '../src/renderer/src/features/i18n/i18n'
import type { Skin } from '../src/shared/skins'
import dust from '../src/renderer/src/assets/dust.jpg'
import '../src/renderer/src/assets/main.css'
const params = new URLSearchParams(location.search)
const items = [
  'Nightfall',
  'Lantern',
  'Specter',
  'Last Light',
  'Sandstorm',
  'Ember',
  'Glacier',
  'Carbon'
].map((name, i) => ({
  id: `${i + 1}1111111-1111-4111-8111-111111111111`,
  gameVersion: 'cs16',
  status: 'ACTIVE',
  weaponKey: ['ak47', 'm4a1', 'awp', 'knife'][i % 4],
  name,
  description: 'Sample catalog item for layout review.',
  pricePoints: [1000, 2000, 3500, 100000][i % 4],
  pointsEnabled: true,
  pricePCash: 250,
  viewerPCash: 5000,
  availableFrom: null,
  availableUntil: null,
  creatorName: 'Preview',
  creatorUrl: null,
  sourceUrl: 'https://example.test/source',
  licenseName: 'Original',
  licenseUrl: null,
  attributionText: '',
  viewModelPath: null,
  playerModelPath: null,
  worldModelPath: null,
  actionSoundPath: null,
  explosionSpritePath: null,
  owned: i === 0
})) as (Skin & { owned: boolean })[]

items.push(
  ...(['ct', 't'] as const).map((team, index) => ({
    ...items[0],
    id: `character-${team}`,
    weaponKey: `player_${team}`,
    name: `${team.toUpperCase()} Operator · sample`,
    description: 'Character model preview fixture.',
    pricePoints: 3500,
    pricePCash: null,
    owned: false,
    viewModelPath: null,
    worldModelPath: null,
    playerModelPath: `models/player/${index === 0 ? 'gign/gign' : 'terror/terror'}.mdl`
  }))
)
const musicSample = {
  kits: [
    {
      id: 'quake',
      name: 'Quake',
      pricePoints: 0,
      enabled: true,
      logoPath: null,
      logoUrl: '/scripts/music-kit-sample-logo.svg',
      sounds: {}
    },
    {
      id: 'arena-demo',
      name: 'Arena Announcer',
      pricePoints: 2500,
      enabled: true,
      logoPath: null,
      logoUrl: '/scripts/music-kit-sample-logo.svg',
      sounds: {}
    }
  ],
  ownedIds: ['quake'],
  equipped: { ct: 'quake', t: 'quake' }
}
const musicActions = { purchases: 0, previews: 0 }
Object.assign(window, { musicActions })
window.api = {
  models: {
    readThumbnail: async () => null,
    writeThumbnail: async () => {},
    read: async (path: string) => {
      const response = await fetch(
        `${__MUSIC_PREVIEW_MODEL_ROOT__}/${path.replace(/^models\//, '')}`
      )
      if (!response.ok) throw new Error('Fixture attachment unavailable')
      return response.arrayBuffer()
    }
  },
  skins: {
    list: async () => {
      if (params.get('state') === 'loading') await new Promise(() => {})
      if (params.get('state') === 'error') throw new Error('Preview catalog unavailable')
      return items
    },
    mine: async () =>
      params.get('owned') === 'characters'
        ? items
            .filter((item) => item.id.startsWith('character-'))
            .map((skin) => ({ skin, acquiredAt: '2026-01-01T00:00:00Z', equippedAt: null }))
        : [],
    collections: async () => [],
    musicKits: async () => {
      if (params.get('music') === 'error') throw new Error('Preview music unavailable')
      return structuredClone(musicSample)
    },
    musicBuy: async (id: string) => {
      musicActions.purchases++
      if (params.get('music') === 'purchase-error') throw new Error('MUSIC_PRICE_CHANGED')
      musicSample.ownedIds.push(id)
      return { points: 7500 }
    },
    musicPreview: async () => {
      musicActions.previews++
      throw new Error('Audio disabled in layout fixture')
    },
    previewModel: async (id: string) => {
      if (id.startsWith('character-')) {
        const model = id === 'character-ct' ? 'gign' : 'terror'
        const response = await fetch(`/resources/lobby-models/${model}_lobby.mdl`)
        if (!response.ok) throw new Error('Fixture model unavailable')
        return response.arrayBuffer()
      }
      throw new Error('Using bundled stock thumbnails in preview')
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
      points: 10000,
      flagCountryCode: null,
      createdAt: '2026-01-01T00:00:00Z',
      hasPassword: true,
      requiresUsernameSetup: false,
      usernameChangeAvailableAt: null
    }
  }
})

useFriendsStore.setState({
  friends: ['Teammate', 'Squadmate', 'Old friend'].map((username, index) => ({
    id: `friend-${index}`,
    username,
    mmr: 1100,
    profileXp: 1000,
    level: 3,
    levelTitle: 'Recruit',
    presence: index === 2 ? 'OFFLINE' : 'ONLINE'
  }))
})
const theme = params.get('theme') === 'modern' ? 'modern' : 'vgui2'
useLauncherThemeStore.getState().setTheme(theme)
document.documentElement.dataset.launcherTheme = theme
useLanguageStore.getState().setLanguage(params.get('lang') === 'ru' ? 'ru' : 'en')
const style = document.createElement('style')
style.textContent =
  ":root:root[data-launcher-theme='vgui2']{--vgui-face:#203f5f;--vgui-inset:#07131f;--vgui-light:#b7c8db;--vgui-dark:#04101b;--vgui-text:#eef4fa;--vgui-accent:#ff941f;--color-white:#eef4fa;--color-neutral-300:#c6d3e2;--color-neutral-950:#07131f}"
document.head.append(style)

createRoot(document.getElementById('root')!).render(
  <div
    className="h-dvh overflow-hidden bg-cover text-white"
    style={{ backgroundImage: `url(${dust})` }}
  >
    <I18nRuntime />
    <LobbyNavigation
      activePage="store"
      onNavigate={() => {}}
      missionsOpen={false}
      onToggleMissions={() => {}}
      missionSnapshot={null}
      missionLoading={false}
      missionError={null}
    />
    <LobbySocialSidebar
      playerId="preview"
      collapsed={false}
      pinned={true}
      onHoverOpen={() => {}}
      onPinnedOpen={() => {}}
      onAutoClose={() => {}}
      onPinToggle={() => {}}
    />
    <div className="vgui-page-host relative h-dvh overflow-hidden pt-16 sm:pt-20 md:pr-72">
      <LauncherWindow
        title="Store"
        hostClassName="vgui-page-window-host vgui-with-friends"
        className="max-w-[1440px]"
        onClose={() => {}}
      >
        <ShopPage />
      </LauncherWindow>
    </div>
  </div>
)
