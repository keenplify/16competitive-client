import { AdminDemosPage } from '../admin-demos/AdminDemosPage'
import { useAdminDemosStore } from '../admin-demos/admin-demos.store'
import {
  Component,
  memo,
  useEffect,
  useState,
  type ErrorInfo,
  type JSX,
  type ReactNode
} from 'react'
import dustBackground from '../../assets/dust.jpg'
import { LobbyNavigation } from '../../components/ui/lobby/Navigation'
import { useAuthStore } from '../auth/auth.store'
import { useDailyQuestStore } from '../daily-quests/daily-quests.store'
import { IdleActionHint } from '../guidance/IdleActionHint'
import { PartyInvitationModal } from '../party/PartyInvitationModal'
import { PartyChat } from '../party/PartyChat'
import { modelForSlot, presentationModelPath } from '../party/party-models'
import { PartyModelScene } from '../party/PartyModelScene'
import { LobbySocialSidebar } from '../party/LobbySocialSidebar'
import { usePartyStore } from '../party/party.store'
import { useLobbyLoadoutStore } from '../party/lobby-loadout.store'
import type { AuthPlayer } from '../../../../shared/auth'
import type { PendingMatchSurvey } from '../../../../shared/match-history'
import type { Party, PartyMember } from '../../../../shared/party'
import { MatchReadyOverlay } from './MatchReadyOverlay'
import { PlayPage } from './PlayPage'
import { useMatchmakingStore } from './matchmaking.store'
import { useCustomGamesStore } from './custom-games.store'
import { useNavigationStore, type LobbyPageId } from '../navigation/navigation.store'
import { SettingsPage } from '../settings/SettingsPage'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { ProfilePage } from '../profile/ProfilePage'
import { ShopPage } from '../skins/ShopPage'
import { MatchResultsPage } from './MatchResultsPage'
import { MatchSurveyPrompt } from './MatchSurveyPrompt'
import { isMatchSurveyDeferredForSession } from './match-survey-session'
import { NewsPage } from '../news/NewsPage'
import { LobbyNewsPanel } from '../news/LobbyNewsPanel'
import { LeaderboardPage } from '../leaderboard/LeaderboardPage'
import { useFriendsStore } from '../friends/friends.store'
import { launcherAudio } from '../audio/audio.manager'

const pageLabels: Record<Exclude<LobbyPageId, 'lobby' | 'play'>, string> = {
  demos: 'Admin demos',
  leaderboard: 'Leaderboard',
  store: 'Store',
  news: 'News',
  settings: 'Settings',
  profile: 'Profile'
}

const defaultWeaponModelPath = (weaponKey: string): string =>
  `p_${weaponKey === 'mp5navy' ? 'mp5' : weaponKey}.mdl`

class LobbyModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Lobby] 3D scene failed; leaving the launcher UI available', error, info)
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

interface LobbySceneProps {
  player: AuthPlayer
  party: Party | null
}

const soloLobbyMember = (player: AuthPlayer): PartyMember => ({
  id: player.id,
  username: player.username,
  mmr: player.mmr,
  level: player.level,
  levelTitle: player.levelTitle,
  xpIntoLevel: player.xpIntoLevel,
  xpForNextLevel: player.xpForNextLevel,
  lobbyPlayerModel: null,
  lobbyWeaponSkinId: null,
  lobbyWeaponKey: 'ak47',
  lobbyWeaponModelPath: null,
  clientMode: 'desktop'
})

const LobbyScene = memo(function LobbyScene({ player, party }: LobbySceneProps): JSX.Element {
  const lobbyPlayerModel = useLobbyLoadoutStore((state) => state.playerModel)
  const lobbyWeaponKey = useLobbyLoadoutStore((state) => state.weaponKey)
  const lobbyWeaponModelPath = useLobbyLoadoutStore((state) => state.weaponModelPath)
  const lobbyWeaponSkinId = useLobbyLoadoutStore((state) => state.weaponSkinId)
  const members = party?.members ?? [soloLobbyMember(player)]

  return (
    <div className="fixed inset-0 z-0 flex min-h-screen flex-col overflow-y-auto pt-16 sm:pt-20">
      <div className="relative flex min-h-0 flex-1">
        <LobbyNewsPanel className="absolute top-0 left-0 z-10 h-full" />
        <LobbyModelErrorBoundary>
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
                weaponSkinId: isCurrentPlayer ? lobbyWeaponSkinId : member.lobbyWeaponSkinId,
                weaponKey: isCurrentPlayer ? lobbyWeaponKey : member.lobbyWeaponKey,
                isLeader: party?.leaderId === member.id,
                isCurrentPlayer
              }
            })}
            className="h-full min-h-[calc(100vh-5rem)] w-full"
          />
        </LobbyModelErrorBoundary>
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
  const playView = useCustomGamesStore((state) => state.playView)
  const navigate = useNavigationStore((state) => state.navigate)
  const setProfileTab = useNavigationStore((state) => state.setProfileTab)
  const requiresGameSetup = useGameSettingsStore((state) => state.requiresGameSetup)
  const connectMatchmaking = useMatchmakingStore((state) => state.connect)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const gameExitCount = useMatchmakingStore((state) => state.gameExitCount)
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
  const matchNeedsAttention = queueStatus === 'match_found' || queueStatus === 'ready_check'
  const showingPlaySelection =
    page === 'play' &&
    playView === 'matchmaking' &&
    !completedMatch &&
    ['idle', 'joining', 'queued', 'leaving'].includes(queueStatus)
  const [installationReady, setInstallationReady] = useState<boolean | null>(null)
  const [friendsRailMode, setFriendsRailMode] = useState<'collapsed' | 'peek' | 'pinned'>('pinned')
  const friendsCollapsed = friendsRailMode === 'collapsed'
  const [friendsHoverOpenDisabledUntil, setFriendsHoverOpenDisabledUntil] = useState(0)
  const [missionsOpen, setMissionsOpen] = useState(false)
  const [seenMissionsKey, setSeenMissionsKey] = useState<string | null>(null)
  const [pendingSurveyState, setPendingSurveyState] = useState<{
    playerId: string
    survey: PendingMatchSurvey | null
  } | null>(null)
  const pendingSurvey =
    pendingSurveyState &&
    pendingSurveyState.playerId === player?.id &&
    !isMatchSurveyDeferredForSession()
      ? pendingSurveyState.survey
      : null
  const missionsKey = questSnapshot
    ? `${questSnapshot.date}:${questSnapshot.quests.map((quest) => `${quest.id}:${quest.progress}:${quest.completed}`).join('|')}`
    : null
  const missionsNeedAttention =
    Boolean(questSnapshot?.quests.length) && missionsKey !== seenMissionsKey
  const idleHintTarget =
    matchNavigationLocked || completedMatch || pendingSurvey || requiresGameSetup
      ? null
      : page === 'lobby'
        ? missionsNeedAttention && !missionsOpen
          ? 'missions'
          : queueStatus === 'idle'
            ? 'play'
            : null
        : page === 'play' && playView === 'matchmaking' && queueStatus === 'idle'
          ? 'find-match'
          : null
  useEffect(() => {
    void refreshLobbyLoadout()
  }, [refreshLobbyLoadout])
  const handleNavigate = (nextPage: LobbyPageId): void => {
    if (matchNavigationLocked && nextPage !== 'settings' && nextPage !== 'play') return
    if (completedMatch) dismissCompletedMatch()
    if (nextPage === 'store' || nextPage === 'profile') collapseFriendsSidebar()
    if (nextPage === 'profile') setProfileTab('skins')
    setMissionsOpen(false)
    navigate(nextPage)
  }

  const handleToggleMissions = (): void => {
    setMissionsOpen((open) => !open)
    setSeenMissionsKey(missionsKey)
  }

  useEffect(() => {
    if (!missionsOpen) return
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-missions-ui]')) {
        setMissionsOpen(false)
        setSeenMissionsKey(missionsKey)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [missionsKey, missionsOpen])

  const collapseFriendsSidebar = (): void => {
    setFriendsRailMode('collapsed')
    setFriendsHoverOpenDisabledUntil(Date.now() + 1_000)
  }

  const handleFriendsPinToggle = (): void => {
    if (friendsRailMode === 'pinned') collapseFriendsSidebar()
    else setFriendsRailMode('pinned')
  }

  useEffect(() => {
    if (!player?.id || isMatchSurveyDeferredForSession()) {
      return
    }

    let active = true
    void window.api.matchHistory
      .getPendingSurvey()
      .then((pending) => {
        if (active && !isMatchSurveyDeferredForSession()) {
          setPendingSurveyState({ playerId: player.id, survey: pending })
        }
      })
      .catch(() => {
        if (active) setPendingSurveyState({ playerId: player.id, survey: null })
      })

    return () => {
      active = false
    }
  }, [player?.id])

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
    if (page !== 'lobby' || queueStatus !== 'idle' || completedMatch) return
    void window.api.updater.checkAfterGameAtLobby().catch((error: unknown) => {
      console.warn('[Updater] Post-game check could not start:', error)
    })
  }, [completedMatch, gameExitCount, page, queueStatus])

  useEffect(() => {
    const navigateOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]')) return
      if (missionsOpen) {
        event.preventDefault()
        setMissionsOpen(false)
        setSeenMissionsKey(missionsKey)
        return
      }
      if (matchNavigationLocked) return
      event.preventDefault()
      if (useMatchmakingStore.getState().completedMatch) dismissCompletedMatch()
      const nextPage = page === 'lobby' ? 'settings' : 'lobby'
      launcherAudio.playSfx(nextPage === 'settings' ? 'forward' : 'backward')
      navigate(nextPage)
    }

    window.addEventListener('keydown', navigateOnEscape, true)
    return () => window.removeEventListener('keydown', navigateOnEscape, true)
  }, [dismissCompletedMatch, matchNavigationLocked, missionsKey, missionsOpen, navigate, page])

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
    if (installationReady === false && page !== 'settings' && !matchNeedsAttention) {
      navigate('settings')
    }
  }, [installationReady, matchNeedsAttention, navigate, page])

  useEffect(() => {
    const currentPage = useNavigationStore.getState().page
    if (queueStatus === 'queued') {
      if (currentPage !== 'settings') navigate('lobby')
      return
    }
    if (
      !matchNeedsAttention &&
      queueStatus !== 'idle' &&
      queueStatus !== 'joining' &&
      queueStatus !== 'leaving' &&
      (currentPage !== 'settings' || matchNeedsAttention)
    ) {
      navigate('play')
    }
  }, [matchNeedsAttention, navigate, queueStatus])

  useEffect(() => {
    useAdminDemosStore.getState().reset()
    if (player?.id) void useAdminDemosStore.getState().load()
    return () => useAdminDemosStore.getState().reset()
  }, [player?.id])

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
    <PlayPage friendsCollapsed={friendsCollapsed} />
  ) : page === 'demos' ? (
    <AdminDemosPage />
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
      {page === 'lobby' &&
        !completedMatch &&
        pendingSurvey &&
        !isMatchSurveyDeferredForSession() && (
          <MatchSurveyPrompt
            key={pendingSurvey.matchId}
            matchId={pendingSurvey.matchId}
            mapDisplayName={pendingSurvey.mapDisplayName}
            mode={pendingSurvey.mode}
            onAnswered={() => setPendingSurveyState({ playerId: player.id, survey: null })}
            onDeferred={() => setPendingSurveyState({ playerId: player.id, survey: null })}
          />
        )}
      <LobbyNavigation
        activePage={page}
        onNavigate={handleNavigate}
        showBackToLobby={!completedMatch && !matchNavigationLocked}
        locked={matchNavigationLocked}
        missionsOpen={missionsOpen && !matchNavigationLocked}
        onToggleMissions={handleToggleMissions}
        missionSnapshot={questSnapshot}
        missionLoading={questStatus === 'loading'}
        missionError={questError}
        className={`fixed top-0 left-0 z-30 ${
          matchNeedsAttention ? 'bg-neutral-950/95 brightness-50' : ''
        }`}
      />
      <IdleActionHint targetId={idleHintTarget} />
      <PartyInvitationModal />
      <PartyChat />
      <LobbySocialSidebar
        playerId={player.id}
        collapsed={friendsCollapsed}
        pinned={friendsRailMode === 'pinned'}
        onHoverOpen={() => setFriendsRailMode('peek')}
        onPinnedOpen={() => setFriendsRailMode('pinned')}
        onAutoClose={() => setFriendsRailMode((mode) => (mode === 'peek' ? 'collapsed' : mode))}
        onPinToggle={handleFriendsPinToggle}
        hoverOpenDisabledUntil={friendsHoverOpenDisabledUntil}
      />
      {content && (
        <div
          className={`relative z-10 bg-linear-to-t from-neutral-950 via-neutral-950/80 to-neutral-950/25 pt-16 backdrop-blur-md transition-[padding-right] duration-300 ease-out sm:pt-20 ${showingPlaySelection ? 'h-dvh overflow-hidden' : 'min-h-screen'} ${
            // The friends rail renders nothing while a match needs attention, so
            // its reserved width must be released for the whole match lifecycle.
            matchNavigationLocked ? 'md:pr-0' : friendsCollapsed ? 'md:pr-11' : 'md:pr-72'
          }`}
        >
          {content}
        </div>
      )}
      {matchNeedsAttention && <MatchReadyOverlay />}
    </main>
  )
}
