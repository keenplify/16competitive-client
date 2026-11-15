import '../src/renderer/src/assets/main.css'
import { createRoot } from 'react-dom/client'
import { StrictMode, useState, type JSX } from 'react'
import { Slide, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import type { CustomGameRoom } from '../src/shared/custom-games'
import type { CustomGameBetting } from '../src/shared/custom-game-bets'
import type { PartnerBranding, PartnerVipView } from '../src/shared/partner-branding'
import type { CommunityCurrency } from '../src/shared/community-currency'
import type { MatchmakingMap, MatchmakingNode } from '../src/shared/matchmaking'
import type { FriendPlayer } from '../src/shared/friends'
import { useCustomGamesStore } from '../src/renderer/src/features/matchmaking/custom-games.store'
import { usePartnerBrandingStore } from '../src/renderer/src/features/partner-branding/partner-branding.store'
import { useLauncherThemeStore } from '../src/renderer/src/features/settings/launcher-theme.store'
import { usePaymentsStore } from '../src/renderer/src/features/skins/payments.store'
import { useAuthStore } from '../src/renderer/src/features/auth/auth.store'
import { useFriendsStore } from '../src/renderer/src/features/friends/friends.store'
import { useMatchmakingStore } from '../src/renderer/src/features/matchmaking/matchmaking.store'
import { PartnerThemeController } from '../src/renderer/src/features/partner-branding/PartnerThemeController'
import { CustomGamesPanel } from '../src/renderer/src/features/matchmaking/CustomGamesPanel'

// ------- Fake data ----------------------------------------------------------
const currency: CommunityCurrency = {
  code: 'PHP',
  symbol: '₱',
  name: 'Philippine Peso',
  prioritizeLocal: true,
  localPerPcashMicros: 4_000_000
}
const betting: CustomGameBetting = {
  enabled: true,
  currency,
  presets: [
    { localMinor: 10_000, pcash: 25 },
    { localMinor: 20_000, pcash: 50 },
    { localMinor: 50_000, pcash: 125 }
  ],
  custom: { enabled: true }
}
const fakeState = { theme: 'latest' as 'latest' | 'vgui2', vipActive: true, selfShort: false }

const room = (): CustomGameRoom => ({
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: 'u1',
  name: 'PINOY 5v5 PUG',
  mode: 'unrated',
  mapId: 'de_dust2',
  startingMoney: 800,
  roundTimeMinutes: null,
  friendlyFire: true,
  legacyMode: false,
  state: 'WAITING',
  maxPlayers: 18,
  teamOneCapacity: 5,
  teamTwoCapacity: 5,
  hasPassword: false,
  betTeamStakeLocalMinor: 20_000,
  matchId: null,
  createdAt: new Date().toISOString(),
  hostNodeId: 'node-sea-1',
  region: 'sea',
  hostApiUrl: 'http://127.0.0.1:3000',
  members: [
    { id: 'u1', username: 'kuya_tolits', mmr: 1450, isBot: false, team: 1, betSharePCash: 17, betCovered: !fakeState.selfShort },
    { id: 'u2', username: 'maria_clara', mmr: 1320, isBot: false, team: 1, betSharePCash: 17, betCovered: true },
    { id: 'u3', username: 'juan_delacruz', mmr: 1180, isBot: false, team: 1, betSharePCash: 17, betCovered: false },
    { id: 'u4', username: 'sniper_galit', mmr: 1410, isBot: false, team: 2, betSharePCash: 25, betCovered: true },
    { id: 'u5', username: 'bano_mag_awp', mmr: 1260, isBot: false, team: 2, betSharePCash: 25, betCovered: true }
  ]
})
const branding = (): PartnerBranding => ({
  partnerId: '583704ab-6fc5-4b58-8fc2-d91cf1d7c051',
  launcherTheme: fakeState.theme,
  primaryColor: '#eb841b',
  secondaryColor: '#38bdf8',
  tertiaryColor: '#a78bfa',
  backgroundUrl: null,
  backgroundKind: null,
  loginBackgroundUrl: null,
  loginBackgroundKind: null,
  logoUrl: null,
  showPapamoGamesLogo: true,
  communityName: 'OLAGUER GEYMING',
  allowOtherCommunities: true,
  customSocialLinksEnabled: false,
  socialLinks: {},
  servers: []
})
const vip = (): PartnerVipView => ({
  active: fakeState.vipActive,
  expiresAt: fakeState.vipActive ? '2027-01-15T00:00:00.000Z' : '2026-08-15T00:00:00.000Z',
  customGamesVipOnly: true
})
const friends: FriendPlayer[] = [
  { id: 'u1', username: 'kuya_tolits', mmr: 1450, profileXp: 1, level: 9, levelTitle: 'Gold Elite', presence: 'offline' },
  { id: 'u2', username: 'maria_clara', mmr: 1320, profileXp: 1, level: 7, levelTitle: 'Silver Elite Master', presence: 'offline' },
  { id: 'u3', username: 'juan_delacruz', mmr: 1180, profileXp: 1, level: 5, levelTitle: 'Gold Nova 1', presence: 'offline' },
  { id: 'u4', username: 'sniper_galit', mmr: 1410, profileXp: 1, level: 8, levelTitle: 'Master Guardian 2', presence: 'offline' },
  { id: 'u5', username: 'bano_mag_awp', mmr: 1260, profileXp: 1, level: 6, levelTitle: 'Gold Nova 3', presence: 'offline' }
]
const maps = [
  { id: 'de_dust2', displayName: 'Dust II', customModes: ['unrated', '5v5', '3v3', 'ffa', 'arena'], supportedModes: [] },
  { id: 'de_inferno', displayName: 'Inferno', customModes: ['unrated', '5v5', '3v3', 'ffa', 'arena'], supportedModes: [] },
  { id: 'de_mirage', displayName: 'Mirage', customModes: ['unrated', '5v5', '3v3', 'ffa', 'arena'], supportedModes: [] }
] as unknown as MatchmakingMap[]
const nodes = [
  { id: 'node-sea-1', publicApiUrl: 'http://127.0.0.1:3000', region: 'sea', latencyMs: 24, available: true, load: 0 }
] as unknown as MatchmakingNode[]

// ------- Seed stores + minimal window.api stub ------------------------------
;(window as unknown as { api: unknown }).api = {
  partnerBranding: {
    get: async () => ({ branding: branding(), currency, vip: vip() }),
    getJoined: async () => ({ branding: null, currency: null, vip: null })
  },
  customGames: {
    list: async () => ({ rooms: [room()], betting }),
    mine: async () => room()
  },
  matchmaking: {
    getMaps: async () => ({ maps: [], customModes: ['unrated', '5v5', '3v3', 'ffa', 'arena'], modeOrder: [] })
  },
  matchHistory: { getPlayerProfile: async () => null }
}

useAuthStore.setState({
  status: 'authenticated',
  session: {
    player: {
      id: 'u1',
      username: 'kuya_tolits',
      email: null,
      mmr: 1450,
      level: 9,
      levelTitle: 'Gold Elite',
      points: 0,
      flagCountryCode: 'PH'
    },
    token: 'preview',
    expiresAt: ''
  }
})
useFriendsStore.setState({ friends })
usePaymentsStore.setState({ snapshot: { enabled: true, pCash: 999, orders: [] } })
useMatchmakingStore.setState({
  customModes: ['unrated', '5v5', '3v3', 'ffa', 'arena'],
  selectedNodeId: 'node-sea-1',
  selectedMode: 'unrated'
})

const seed = (scene: 'lobby' | 'create'): void => {
  usePartnerBrandingStore.setState({
    accountId: 'u1',
    branding: branding(),
    currency,
    vip: vip(),
    enabled: true,
    resolved: true
  })
  useLauncherThemeStore.setState({ theme: 'community', hasPreference: false })
  usePaymentsStore.setState({
    snapshot: { enabled: true, pCash: fakeState.selfShort ? 3 : 999, orders: [] }
  })
  useCustomGamesStore.setState(
    scene === 'lobby'
      ? { currentRoom: room(), rooms: [room()], betting, createModalOpen: false, settingsModalOpen: false, error: null }
      : { currentRoom: null, rooms: [room()], betting, createModalOpen: true, settingsModalOpen: false, error: null }
  )
}

// ------- Preview shell ------------------------------------------------------
function PreviewShell(): JSX.Element {
  const [, force] = useState(0)
  const [scene, setScene] = useState<'lobby' | 'create'>('lobby')
  const rerender = (): void => force((value) => value + 1)
  const pickScene = (next: 'lobby' | 'create'): void => {
    setScene(next)
    seed(next)
  }
  const pickTheme = (next: 'latest' | 'vgui2'): void => {
    fakeState.theme = next
    seed(scene)
    rerender()
  }
  const toggleVip = (): void => {
    fakeState.vipActive = !fakeState.vipActive
    seed(scene)
    rerender()
  }
  const toggleSelfShort = (): void => {
    fakeState.selfShort = !fakeState.selfShort
    seed(scene)
    rerender()
  }

  const buttonClass =
    'h-9 border border-white/20 bg-black/40 px-4 text-xs font-semibold text-neutral-200 hover:border-amber-200/60'
  return (
    <>
      <PartnerThemeController />
      <ToastContainer
        position="top-left"
        theme="dark"
        autoClose={3500}
        style={{ marginTop: '4rem' }}
        transition={Slide}
        className="launcher-toast-container"
      />
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-white/15 bg-neutral-950/80 p-4">
          <div>
            <p className="text-sm font-semibold text-white">Custom game betting — 1.6C preview</p>
            <p className="mt-1 text-xs text-neutral-400">
              Fake data · OLAGUER GEYMING · 1 PCash = ₱4.00 · Real launcher components
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => pickTheme('latest')}>
              Default theme
            </button>
            <button type="button" className={buttonClass} onClick={() => pickTheme('vgui2')}>
              VGUI theme
            </button>
            <button type="button" className={buttonClass} onClick={() => pickScene('lobby')}>
              Lobby + settings
            </button>
            <button type="button" className={buttonClass} onClick={() => pickScene('create')}>
              Create gate
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => useCustomGamesStore.setState({ settingsModalOpen: true })}
            >
              Room settings
            </button>
            <button type="button" className={buttonClass} onClick={toggleVip}>
              VIP: {fakeState.vipActive ? 'active' : 'expired'}
            </button>
            <button type="button" className={buttonClass} onClick={toggleSelfShort}>
              My balance: {fakeState.selfShort ? '₱12.00 (3 PCash)' : '₱3,996.00 (999 PCash)'}
            </button>
          </div>
        </div>
        <div className="flex min-h-[70vh] flex-col border border-white/10 bg-neutral-950/60">
          <CustomGamesPanel currentPlayerId="u1" maps={maps} nodes={nodes} selectedNodeId="node-sea-1" />
        </div>
        <p className="text-center text-xs text-neutral-500">
          Preview only. The room settings betting widget, per-player BET labels and the
          short-balance marker are the real launcher components.
        </p>
      </div>
    </>
  )
}

seed('lobby')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreviewShell />
  </StrictMode>
)
