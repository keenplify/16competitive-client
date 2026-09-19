import { ChevronDown, ChevronUp, ClipboardList } from 'lucide-react'
import { memo, useEffect, useState, type JSX } from 'react'
import dustBackground from '../../assets/dust.jpg'
import { LobbyNavigation } from '../../components/ui/lobby/Navigation'
import { useAuthStore } from '../auth/auth.store'
import { DailyQuestsPanel } from '../daily-quests/DailyQuestsPanel'
import { useDailyQuestStore } from '../daily-quests/daily-quests.store'
import { PartyInvitationModal } from '../party/PartyInvitationModal'
import { PartyChat } from '../party/PartyChat'
import { modelForSlot, presentationModelPath } from '../party/party-models'
import { PartyModelScene } from '../party/PartyModelScene'
import { LobbySocialSidebar } from '../party/LobbySocialSidebar'
import { usePartyStore } from '../party/party.store'
import { useLobbyLoadoutStore } from '../party/lobby-loadout.store'
import type { AuthPlayer } from '../../../../shared/auth'
import type { Party, PartyMember } from '../../../../shared/party'
import { PlayPage } from './PlayPage'
import { useMatchmakingStore } from './matchmaking.store'
import { useNavigationStore, type LobbyPageId } from '../navigation/navigation.store'
import { SettingsPage } from '../settings/SettingsPage'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { ProfilePage } from '../profile/ProfilePage'
import { ShopPage } from '../skins/ShopPage'
import { MatchResultsPage } from './MatchResultsPage'
import { NewsPage } from '../news/NewsPage'
import { LobbyNewsPanel } from '../news/LobbyNewsPanel'
import { LeaderboardPage } from '../leaderboard/LeaderboardPage'
import { useFriendsStore } from '../friends/friends.store'
import { launcherAudio } from '../audio/audio.manager'

const pageLabels: Record<Exclude<LobbyPageId, 'lobby' | 'play'>, string> = {
  leaderboard: 'Leaderboard',
  store: 'Store',
  news: 'News',
  settings: 'Settings',
  profile: 'Profile'
}

const defaultWeaponModelPath = (weaponKey: string): string =>
  `p_${weaponKey === 'mp5navy' ? 'mp5' : weaponKey}.mdl`

interface LobbySceneProps {
  player: AuthPlayer
  party: Party | null
}

const soloLobbyMember = (player: AuthPlayer): PartyMember => ({
  id: player.id,
  username: player.username,
  mmr: player.mmr,
  lobbyPlayerModel: null,
  lobbyWeaponSkinId: null,
  lobbyWeaponKey: 'ak47',
  lobbyWeaponModelPath: null
})

const LobbyScene = memo(function LobbyScene({ player, party }: LobbySceneProps): JSX.Element {
  const lobbyPlayerModel = useLobbyLoadoutStore((state) => state.playerModel)
  const lobbyWeaponKey = useLobbyLoadoutStore((state) => state.weaponKey)
  const lobbyWeaponModelPath = useLobbyLoadoutStore((state) => state.weaponModelPath)
  const members = party?.members ?? [soloLobbyMember(player)]

  return (
    <div className="fixed inset-0 z-0 flex min-h-screen flex-col overflow-y-auto pt-16 sm:pt-20">
      <div className="relative flex min-h-0 flex-1">
        {members.length < 4 && <LobbyNewsPanel className="absolute top-0 left-0 z-10 h-full" />}
        <PartyModelScene
          actors={members.map((member, index) => {
            const isCurrentPlayer = member.id === player.id
            const fallbackModelPath = modelForSlot(index, member)
            const selectedModelPath = isCurrentPlayer
              ? lobbyPlayerModel
              : (member.lobbyPlayerModel ?? fallbackModelPath)
            return {
              member,
              modelPath: presentationModelPath(selectedModelPath),
              fallbackModelPath,
              weaponPath: isCurrentPlayer
                ? (lobbyWeaponModelPath ?? defaultWeaponModelPath(lobbyWeaponKey))
                : (member.lobbyWeaponModelPath ?? defaultWeaponModelPath(member.lobbyWeaponKey)),
              weaponKey: isCurrentPlayer ? lobbyWeaponKey : member.lobbyWeaponKey,
              isLeader: party?.leaderId === member.id,
              isCurrentPlayer
            }
          })}
          className="h-full min-h-[calc(100vh-5rem)] w-full"
        />
      </div>
    </div>
  )
})

export function LobbyPage(): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const party = usePartyStore((state) => state.party)
  const startParty = usePartyStore((state) => state.start)
  const stopParty = usePartyStore((state) => state.stop)
  const startFriends = useFriendsStore((state) => state.start)
  const stopFriends = useFriendsStore((state) => state.stop)
  const questSnapshot = useDailyQuestStore((state) => state.snapshot)
  const questStatus = useDailyQuestStore((state) => state.status)
  const questError = useDailyQuestStore((state) => state.error)
  const startDailyQuests = useDailyQuestStore((state) => state.start)
  const stopDailyQuests = useDailyQuestStore((state) => state.stop)
  const page = useNavigationStore((state) => state.page)
  const navigate = useNavigationStore((state) => state.navigate)
  const requiresGameSetup = useGameSettingsStore((state) => state.requiresGameSetup)
  const connectMatchmaking = useMatchmakingStore((state) => state.connect)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const serverRestarting = useMatchmakingStore((state) => state.serverRestarting)
  const completedMatch = useMatchmakingStore((state) => state.completedMatch)
  const dismissCompletedMatch = useMatchmakingStore((state) => state.dismissCompletedMatch)
  const refreshLobbyLoadout = useLobbyLoadoutStore((state) => state.refresh)
  const matchNavigationLocked = [
    'match_found',
    'ready_check',
    'countdown',
    'starting_server',
    'server_ready'
  ].includes(queueStatus)
  const [installationReady, setInstallationReady] = useState<boolean | null>(null)
  const [friendsCollapsed, setFriendsCollapsed] = useState(false)
  const [friendsHoverOpenDisabledUntil, setFriendsHoverOpenDisabledUntil] = useState(0)
  const [dailyMissionsCollapsed, setDailyMissionsCollapsed] = useState(false)
  useEffect(() => {
    void refreshLobbyLoadout()
  }, [refreshLobbyLoadout])
  const handleNavigate = (nextPage: LobbyPageId): void => {
    if (matchNavigationLocked && nextPage !== 'settings' && nextPage !== 'play') return
    if (completedMatch) dismissCompletedMatch()
    if (nextPage === 'store' || nextPage === 'profile') collapseFriendsSidebar()
    navigate(nextPage)
  }

  const collapseFriendsSidebar = (): void => {
    setFriendsCollapsed(true)
    setFriendsHoverOpenDisabledUntil(Date.now() + 1_000)
  }

  const handleFriendsCollapsedChange = (collapsed: boolean): void => {
    if (collapsed) {
      setFriendsHoverOpenDisabledUntil(Date.now() + 1_000)
    }
    setFriendsCollapsed(collapsed)
  }

  useEffect(() => {
    startParty()
    startFriends()
    startDailyQuests()
    return () => {
      stopParty()
      stopFriends()
      stopDailyQuests()
    }
  }, [startDailyQuests, startFriends, startParty, stopDailyQuests, stopFriends, stopParty])

  useEffect(() => {
    void connectMatchmaking()
  }, [connectMatchmaking])

  useEffect(() => {
    const returnToLobby = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      if (page === 'lobby' || matchNavigationLocked) return
      event.preventDefault()
      if (useMatchmakingStore.getState().completedMatch) dismissCompletedMatch()
      launcherAudio.playSfx('backward')
      navigate('lobby')
    }

    window.addEventListener('keydown', returnToLobby, true)
    return () => window.removeEventListener('keydown', returnToLobby, true)
  }, [dismissCompletedMatch, matchNavigationLocked, navigate, page])

  useEffect(() => {
    let active = true
    const check = () => {
      void window.api.gameSettings
        .get()
        .then((settings) => {
          if (active) setInstallationReady(Boolean(settings.cs16ExecutablePath))
        })
        .catch(() => {
          if (active) setInstallationReady(false)
        })
    }
    check()
    const timer = window.setInterval(check, 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (installationReady === false && page !== 'settings') navigate('settings')
  }, [installationReady, navigate, page])

  useEffect(() => {
    const currentPage = useNavigationStore.getState().page
    if (queueStatus === 'queued') {
      if (currentPage !== 'settings') navigate('lobby')
      return
    }
    if (
      queueStatus !== 'idle' &&
      queueStatus !== 'joining' &&
      queueStatus !== 'leaving' &&
      currentPage !== 'settings'
    ) {
      navigate('play')
    }
  }, [navigate, queueStatus])

  if (!player) return <main className="min-h-screen bg-neutral-950" />

  if (serverRestarting) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <section className="w-full max-w-md border border-amber-300/40 bg-amber-300/10 p-8 shadow-2xl">
          <p className="text-xs font-bold tracking-[0.22em] text-amber-300 uppercase">
            Server update
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Reconnecting shortly</h1>
          <p className="mt-3 text-sm leading-relaxed text-amber-100/80">
            {serverRestarting.message}
          </p>
          <p className="mt-5 text-xs text-neutral-400">
            The launcher will reconnect automatically in about{' '}
            {Math.ceil(serverRestarting.retryAfterMs / 1_000)} seconds.
          </p>
        </section>
      </main>
    )
  }

  const content = requiresGameSetup ? (
    <SettingsPage />
  ) : completedMatch ? (
    <MatchResultsPage match={completedMatch} />
  ) : page === 'play' ? (
    <PlayPage />
  ) : page === 'settings' ? (
    <SettingsPage />
  ) : page === 'profile' ? (
    <ProfilePage />
  ) : page === 'store' ? (
    <ShopPage />
  ) : page === 'news' ? (
    <NewsPage />
  ) : page === 'leaderboard' ? (
    <LeaderboardPage />
  ) : page === 'lobby' ? null : (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-neutral-950/90 p-6">
      <div className="text-center">
        <p className="text-xs font-bold tracking-[0.18em] text-sky-400 uppercase">
          {pageLabels[page]}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Coming soon</h1>
      </div>
    </main>
  )

  return (
    <main
      className="relative min-h-screen bg-neutral-950 bg-cover bg-center bg-fixed text-white"
      style={{ backgroundImage: `url(${dustBackground})` }}
    >
      <LobbyScene player={player} party={party} />
      {page === 'lobby' && !completedMatch && (
        <div
          className={`fixed top-20 right-4 z-20 w-[min(20rem,calc(100vw-2rem))] transition-[right] duration-300 ease-out sm:top-24 ${
            friendsCollapsed ? 'md:right-16' : 'md:right-[calc(18rem+1rem)]'
          }`}
        >
          <section className="overflow-hidden border border-white/10 bg-neutral-950/90 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
              aria-expanded={!dailyMissionsCollapsed}
              aria-controls="lobby-daily-missions"
              onClick={() => setDailyMissionsCollapsed((collapsed) => !collapsed)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <ClipboardList className="size-4 text-sky-300" aria-hidden="true" /> Daily missions
              </span>
              {dailyMissionsCollapsed ? (
                <ChevronDown className="size-4 text-white/55" aria-hidden="true" />
              ) : (
                <ChevronUp className="size-4 text-white/55" aria-hidden="true" />
              )}
            </button>
            <div
              id="lobby-daily-missions"
              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                dailyMissionsCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="border-t border-white/10">
                  <DailyQuestsPanel
                    snapshot={questSnapshot}
                    loading={questStatus === 'loading'}
                    error={questError}
                    compact
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      <LobbyNavigation
        activePage={page}
        onNavigate={handleNavigate}
        showBackToLobby={!completedMatch && !matchNavigationLocked}
        locked={matchNavigationLocked}
        className="fixed top-0 left-0 z-30"
      />
      <PartyInvitationModal />
      <PartyChat />
      <LobbySocialSidebar
        playerId={player.id}
        collapsed={friendsCollapsed}
        onCollapsedChange={handleFriendsCollapsedChange}
        hoverOpenDisabledUntil={friendsHoverOpenDisabledUntil}
      />
      {content && (
        <div className="relative z-10 min-h-screen bg-linear-to-t from-neutral-950 via-neutral-950/80 to-neutral-950/25 pt-16 backdrop-blur-md sm:pt-20">
          {content}
        </div>
      )}
    </main>
  )
}
