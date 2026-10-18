import { MatchDetailsOverlay } from '../src/renderer/src/features/profile/MatchDetailsOverlay'
import { LobbySocialSidebar } from '../src/renderer/src/features/party/LobbySocialSidebar'
import { useFriendsStore } from '../src/renderer/src/features/friends/friends.store'
import { bundledWeaponPreview } from '../src/renderer/src/features/skins/bundled-weapon-previews'
import type { JSX } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/renderer/src/assets/main.css'
import { ProfilePage } from '../src/renderer/src/features/profile/ProfilePage'
import { ProfileOverlay } from '../src/renderer/src/features/profile/ProfileOverlay'
import { useProfileStore } from '../src/renderer/src/features/profile/profile.store'
import { useAuthStore } from '../src/renderer/src/features/auth/auth.store'
import { useNavigationStore } from '../src/renderer/src/features/navigation/navigation.store'
import { useLanguageStore } from '../src/renderer/src/features/i18n/i18n'

const me = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
let scenario = 'populated'
const matches = [
  'de_dust2',
  'de_inferno',
  'de_nuke',
  'de_train',
  'de_mirage',
  'de_dust2',
  'de_tuscan',
  'de_aztec',
  'de_cache',
  'de_cbble'
].map((mapId, i) => ({
  id: `match-${i}`,
  mapId,
  mode: ['5v5', '5v5', 'unrated', 'ffa', '5v5', '5v5', 'unrated'][i % 7],
  winner: 'team_1',
  score: i % 3 === 1 ? '9-13' : '13-8',
  completedAt: new Date(Date.UTC(2026, 9, 18 - i)).toISOString(),
  team: 'team_1',
  result: i % 3 === 1 ? 'loss' : 'win',
  kills: 24 - i,
  deaths: 12 + i,
  assists: 5,
  headshots: 8,
  damage: 2300,
  headshotPercent: 42,
  adr: 96.3,
  mmrBefore: 1800,
  mmrAfter: 1824,
  mmrChange: i % 3 === 1 ? -19 : 24
}))
const refreshedAt = new Date().toISOString()
const activity = {
  total: 210,
  refreshedAt,
  modes: [
    { id: '5v5', matches: 140, wins: 88 },
    { id: 'unrated', matches: 45, wins: 26 },
    { id: 'ffa', matches: 25, wins: 12 }
  ],
  maps: [
    'de_dust2',
    'de_inferno',
    'de_nuke',
    'de_mirage',
    'de_train',
    'de_tuscan',
    'de_aztec',
    'de_cache',
    'de_cbble'
  ].map((id, i) => ({
    id,
    matches: [55, 40, 30, 25, 20, 15, 10, 8, 7][i],
    wins: [35, 24, 17, 15, 11, 9, 6, 5, 4][i]
  }))
}
const profile = (id: string) => ({
  id,
  username: id === me ? 'papamo' : 'headshot_juan',
  level: id === me ? 24 : 17,
  levelTitle: 'Lieutenant Colonel',
  mmr: id === me ? 1842 : 1568,
  flagCountryCode: 'PH',
  wins: 126,
  losses: 84,
  kills: 3100,
  deaths: 2400,
  assists: 820,
  createdAt: '2026-02-12T00:00:00Z',
  activity: scenario === 'empty' ? { total: 0, refreshedAt, maps: [], modes: [] } : activity,
  recentMatches: scenario === 'empty' ? [] : matches,
  loadout:
    scenario === 'empty'
      ? []
      : [
          {
            id: 'skin-1',
            equipped: false,
            name: 'AK-47 | Classic',
            weaponKey: 'ak47',
            gameVersion: 'cs16'
          },
          {
            id: 'skin-2',
            equipped: true,
            name: 'M4A1 | Classic',
            weaponKey: 'm4a1',
            gameVersion: 'cs16'
          },
          {
            id: 'skin-3',
            equipped: false,
            name: 'AWP | Classic',
            weaponKey: 'awp',
            gameVersion: 'cs16'
          },
          {
            id: 'skin-4',
            equipped: true,
            name: 'Knife | Classic',
            weaponKey: 'knife',
            gameVersion: 'cs16'
          }
        ]
})
window.api = new Proxy(
  {},
  {
    get: (_, area) =>
      new Proxy(
        {},
        {
          get: (_, method) => {
            if (area === 'matchHistory' && method === 'get') return async () => matches
            if (area === 'matchHistory' && method === 'getSummary')
              return async (id: string) => ({
                ...matches.find((match) => match.id === id),
                id,
                players: Array.from({ length: 10 }, (_, i) => ({
                  id: i === 0 ? me : i === 1 ? other : `preview-player-${i}`,
                  username: i === 0 ? 'papamo' : i === 1 ? 'headshot_juan' : `Player_${i + 1}`,
                  team: i < 5 ? 'team_1' : 'team_2',
                  result: i < 5 ? 'win' : 'loss',
                  kills: 24 - i,
                  deaths: 12 + i,
                  assists: 5,
                  headshots: 8,
                  damage: 2100,
                  headshotPercent: 40,
                  adr: 90,
                  mmrBefore: 1500,
                  mmrAfter: 1524,
                  mmrChange: 24
                }))
              })
            if (area === 'friends' && method === 'list')
              return async () => ({
                friends: useFriendsStore.getState().friends,
                incomingRequests: []
              })
            if (area === 'matchHistory' && method === 'getPlayerProfile')
              return async (id: string) => {
                await new Promise((resolve) =>
                  setTimeout(resolve, scenario === 'loading' ? 60000 : 350)
                )
                if (scenario === 'error') throw new Error('Preview error')
                return profile(id)
              }
            if (area === 'models' && method === 'readThumbnail')
              return async (key: string) => {
                const weapon = key.includes('skin-1')
                  ? 'ak47'
                  : key.includes('skin-2')
                    ? 'm4a1'
                    : key.includes('skin-3')
                      ? 'awp'
                      : 'knife'
                const url = bundledWeaponPreview(weapon)
                return url ? (await fetch(url)).arrayBuffer() : null
              }
            if (area === 'auth' && method === 'changeFlagCountryCode')
              return async (flagCountryCode: string) => ({ flagCountryCode })
            if (String(method).startsWith('on')) return () => () => {}
            return async () => []
          }
        }
      )
  }
) as typeof window.api
useAuthStore.setState({ session: { player: profile(me) } as never, status: 'authenticated' })
useLanguageStore.getState().setLanguage('en')
useFriendsStore.setState({ friends: [{ ...profile(other), profileXp: 24000, presence: 'ONLINE' }] })
export function Preview(): JSX.Element {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/15 bg-neutral-900 px-6 py-3 text-sm">
        <strong className="mr-auto text-amber-200">Preview · Fake player data</strong>
        <button
          className="border border-white/20 px-3 py-1"
          onClick={() => {
            useProfileStore.getState().close()
            useNavigationStore.getState().setProfileTab('overview')
          }}
        >
          My profile
        </button>
        <button
          className="border border-white/20 px-3 py-1"
          onClick={() => useProfileStore.getState().open(other)}
        >
          Other player / post-match
        </button>
        <select
          aria-label="Preview state"
          className="border border-white/20 bg-neutral-900 px-3 py-1"
          onChange={(event) => {
            scenario = event.target.value
            void useProfileStore.getState().load(useProfileStore.getState().selectedId ?? me)
          }}
        >
          <option value="populated">Populated</option>
          <option value="empty">Empty</option>
          <option value="loading">Loading</option>
          <option value="error">Error</option>
        </select>
      </div>
      <div style={{ paddingRight: 256 }}>
        <ProfilePage />
      </div>
      <LobbySocialSidebar
        playerId={me}
        collapsed={false}
        pinned={true}
        onHoverOpen={() => {}}
        onPinnedOpen={() => {}}
        onAutoClose={() => {}}
        onPinToggle={() => {}}
      />
      <ProfileOverlay />
      <MatchDetailsOverlay />
    </div>
  )
}
const root = createRoot(document.getElementById('root')!)
root.render(<Preview />)
import.meta.hot?.dispose(() => root.unmount())
