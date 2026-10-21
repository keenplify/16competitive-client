import { PlayerActivity } from './PlayerActivity'
import { MatchmakingMapPool } from './MatchmakingMapPool'
import { QueueWarmupPanel } from './QueueWarmupPanel'
import { FindMatchButton, PlayQueueActions } from './FindMatchButton'
import { SelectField } from '../../components/ui/SelectField'
import { useQueueWarmupStore } from './queue-warmup.store'
import { PartnerServersPanel } from '../partner-branding/PartnerServersPanel'
import { useCommunityText } from '../partner-branding/community-copy'
import { usePartnerBrandingStore } from '../partner-branding/partner-branding.store'
import { useEffect, useState, type JSX } from 'react'
import { CircleHelp, Copy, LoaderCircle, LogOut } from 'lucide-react'
import { toast } from 'react-toastify'
import { twMerge } from 'tailwind-merge'
import {
  allowsManualMatchConnection,
  getMatchmakingModeLabel
} from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { TabList } from '../../components/ui/TabList'
import { NotificationContent } from '../../components/ui/NotificationContent'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { CustomGamesPanel } from './CustomGamesPanel'
import { useCustomGamesStore } from './custom-games.store'
import { usePartyStore } from '../party/party.store'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useMatchmakingStore } from './matchmaking.store'
import { OfflineQueuePrompt } from './OfflineQueuePrompt'
import { useOfflineQueuePromptStore } from './offline-queue-prompt.store'
import { TeamRoster } from './TeamRoster'
import { InGameRoster } from './InGameRoster'
import { MatchmakingRegionSelect } from './MatchmakingRegionSelect'
import { PlayWindowStatus } from './PlayWindowStatus'
import { displayedPlayWindowNode } from './play-window-node'
import { localMapPreviews } from './map-previews'
import { isWebRuntime } from '../../web-runtime'
import { desktopAppUrl } from '../community/links'

const connectionLabels = {
  disconnected: 'Offline',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  handoff: 'Connecting to match region',
  authenticating: 'Authenticating',
  ready: 'Connected'
} as const

const queueModes = [
  '5v5',
  'unrated',
  'legacy',
  'legacy_3v3',
  'cs13_3v3',
  'ffa',
  'arena',
  '3v3'
] as const

export function PlayPage({
  friendsCollapsed = false
}: {
  friendsCollapsed?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const communityText = useCommunityText()
  const hasCommunityServers = usePartnerBrandingStore(
    (state) => (state.branding?.servers.length ?? 0) > 0
  )
  const player = useAuthStore((state) => state.session?.player)
  const party = usePartyStore((state) => state.party)
  const connectionStatus = useMatchmakingStore((state) => state.connectionStatus)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const selectedMode = useMatchmakingStore((state) => state.selectedMode)
  const maps = useMatchmakingStore((state) => state.maps)
  const mapsStatus = useMatchmakingStore((state) => state.mapsStatus)
  const selectedMapIds = useMatchmakingStore((state) => state.selectedMapIds)
  const nodes = useMatchmakingStore((state) => state.nodes)
  const selectedNodeId = useMatchmakingStore((state) => state.selectedNodeId)
  const allowRegionExpansion = useMatchmakingStore((state) => state.allowRegionExpansion)
  const match = useMatchmakingStore((state) => state.match)
  const acceptedPlayerIds = useMatchmakingStore((state) => state.acceptedPlayerIds)
  const countdown = useMatchmakingStore((state) => state.countdown)
  const connectionDetails = useMatchmakingStore((state) => state.connectionDetails)
  const gameExited = useMatchmakingStore((state) => state.gameExited)
  const error = useMatchmakingStore((state) => state.error)
  const loadMaps = useMatchmakingStore((state) => state.loadMaps)
  const loadRegions = useMatchmakingStore((state) => state.loadRegions)
  const selectNode = useMatchmakingStore((state) => state.selectNode)
  const setAllowRegionExpansion = useMatchmakingStore((state) => state.setAllowRegionExpansion)
  const selectMode = useMatchmakingStore((state) => state.selectMode)
  const selectMap = useMatchmakingStore((state) => state.selectMap)
  const joinQueue = useMatchmakingStore((state) => state.joinQueue)
  const requestOfflineQueue = useOfflineQueuePromptStore((state) => state.requestQueue)
  const checkingDiscord = useOfflineQueuePromptStore((state) => state.checking)
  const reconnectGame = useMatchmakingStore((state) => state.reconnectGame)
  const copyConnection = useMatchmakingStore((state) => state.copyConnection)
  const copyConnectionStatus = useMatchmakingStore((state) => state.copyConnectionStatus)
  const matchReadyAt = useMatchmakingStore((state) => state.matchReadyAt)
  const gameExecutablePath = useGameSettingsStore((state) => state.savedPath)
  const loadGameSettings = useGameSettingsStore((state) => state.load)
  const navigate = useNavigationStore((state) => state.navigate)
  const playView = useCustomGamesStore((state) => state.playView)
  const playViewManuallySelected = useCustomGamesStore((state) => state.playViewManuallySelected)
  const setPlayView = useCustomGamesStore((state) => state.setPlayView)
  const preferCommunityServers = useCustomGamesStore((state) => state.preferCommunityServers)
  const clearUnavailableCommunityServers = useCustomGamesStore(
    (state) => state.clearUnavailableCommunityServers
  )
  useEffect(() => {
    if (playView === 'partner' && !hasCommunityServers) clearUnavailableCommunityServers()
  }, [playView, hasCommunityServers, clearUnavailableCommunityServers])
  useEffect(() => {
    if (hasCommunityServers && !playViewManuallySelected && queueStatus === 'idle')
      preferCommunityServers()
  }, [hasCommunityServers, playViewManuallySelected, queueStatus, preferCommunityServers])
  const currentCustomRoom = useCustomGamesStore((state) => state.currentRoom)
  const moveCustomRoom = useCustomGamesStore((state) => state.moveServer)
  const movingCustomRoom = useCustomGamesStore((state) => state.movingServer)
  const leaveCustomRoom = useCustomGamesStore((state) => state.leaveRoom)
  const restoreCustomRoom = useCustomGamesStore((state) => state.restoreRoom)
  const customRoomError = useCustomGamesStore((state) => state.error)
  const [clockNow, setClockNow] = useState(Date.now)
  const [leavingCustomMatch, setLeavingCustomMatch] = useState(false)
  const webRuntime = isWebRuntime()
  const partyRequiresWeb =
    webRuntime || Boolean(party?.members.some(({ clientMode }) => clientMode !== 'desktop'))
  const isSearching = queueStatus === 'queued' || queueStatus === 'leaving'
  const warmupBrowsing = useQueueWarmupStore((state) => state.browsing)
  const openWarmup = useQueueWarmupStore((state) => state.open)
  const closeWarmup = useQueueWarmupStore((state) => state.dismiss)
  const warmupEligible = queueStatus === 'queued' && selectedMode === '5v5'
  const showWarmup = warmupEligible && warmupBrowsing

  useEffect(() => {
    if (mapsStatus !== 'ready' || queueStatus !== 'idle') return
    const modeAvailable = (mode: (typeof queueModes)[number]): boolean =>
      maps.some((map) =>
        partyRequiresWeb ? map.webModes.includes(mode) : map.supportedModes.includes(mode)
      )
    if (queueModes.some((mode) => mode === selectedMode && modeAvailable(mode))) return
    const fallback = queueModes.find(modeAvailable)
    if (fallback) selectMode(fallback)
  }, [maps, mapsStatus, partyRequiresWeb, queueStatus, selectedMode, selectMode])

  useEffect(() => {
    if (!match?.hostApiUrl) return
    const host = match.hostApiUrl
    // The active match screen bypasses CustomGamesPanel after a restart.
    // Restore room membership from the match host, independently of room listing.
    void restoreCustomRoom(host)
    const timer = window.setInterval(() => void restoreCustomRoom(host), 10_000)
    return () => window.clearInterval(timer)
  }, [match?.matchId, match?.hostApiUrl, restoreCustomRoom])

  useEffect(() => {
    void loadMaps()
    const timer = window.setInterval(() => void loadMaps(), 30_000)
    return () => window.clearInterval(timer)
  }, [loadMaps])

  useEffect(() => {
    void loadRegions()
    const timer = window.setInterval(() => void loadRegions(), 15_000)
    return () => window.clearInterval(timer)
  }, [loadRegions])

  useEffect(() => {
    void loadGameSettings()
  }, [loadGameSettings])

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  useEffect(() => {
    if (customRoomError)
      toast.error(
        <NotificationContent title={t('customGames.errorTitle')} message={customRoomError} />
      )
  }, [customRoomError, t])

  useEffect(() => {
    if (queueStatus !== 'server_ready' || !matchReadyAt) return
    const timer = window.setInterval(() => setClockNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [queueStatus, matchReadyAt])

  const handleReconnect = async (): Promise<void> => {
    // Revalidate through the main process: a saved path can become stale if the
    // player deletes or moves their Counter-Strike installation while the app is open.
    const settings = await window.api.gameSettings.get().catch(() => null)
    if (!webRuntime && !settings?.cs16ExecutablePath) {
      useGameSettingsStore.getState().promptToConfigureForMatch()
      navigate('settings')
      return
    }

    await reconnectGame()
  }

  const handleLeaveCustomMatch = async (): Promise<void> => {
    if (!currentCustomRoom?.matchId || leavingCustomMatch) return
    setLeavingCustomMatch(true)
    try {
      await leaveCustomRoom()
    } finally {
      setLeavingCustomMatch(false)
    }
  }

  const handleFindMatch = (): void => {
    if (!isConnected) {
      toast.error('Connect to matchmaking before searching.')
      return
    }
    if (mapsStatus !== 'ready') {
      toast.info('Maps are still loading. Try again shortly.')
      return
    }
    if (!hasSelectedMaps) {
      toast.error('Select at least one map to find a match.')
      return
    }
    if (!webRuntime && !gameExecutablePath) {
      toast.error('Choose and save your Counter-Strike folder in Settings first.')
      return
    }
    if (partyRequiresWeb && !modeAllowsWeb) {
      toast.error(
        'This game mode is not available for Web Play. Choose another mode or use a desktop-only party.'
      )
      return
    }
    if (selectedMode === '5v5' && player) void requestOfflineQueue(player.id)
    else void joinQueue()
  }

  if (!player) return <main className="min-h-screen bg-neutral-950" />

  const isLeader = !party || party.leaderId === player.id
  const modeAllowsWeb = maps.some((map) => map.webModes.includes(selectedMode))
  const desktopOnlyMode = partyRequiresWeb && !modeAllowsWeb
  const isConnected = connectionStatus === 'ready'
  const visibleQueueModes =
    mapsStatus === 'ready'
      ? queueModes.filter((mode) =>
          maps.some((map) =>
            partyRequiresWeb ? map.webModes.includes(mode) : map.supportedModes.includes(mode)
          )
        )
      : queueModes.filter((mode) => mode !== 'cs13_3v3')
  const copyWaitSeconds = matchReadyAt
    ? Math.max(0, Math.ceil((matchReadyAt + 10_000 - clockNow) / 1_000))
    : 10
  const retryWindowOpen = copyWaitSeconds === 0
  const manualConnectionAllowed =
    allowsManualMatchConnection(match?.mode) ||
    (match?.mode === '5v5' && maps.some((map) => map.webModes.includes('5v5')))
  const availableMaps = maps.filter(
    (map) =>
      map.supportedModes.includes(selectedMode) &&
      (!partyRequiresWeb || map.webModes.includes(selectedMode))
  )
  const hasSelectedMaps = selectedMapIds.length > 0
  const visiblePlayView = playView === 'partner' && !hasCommunityServers ? 'matchmaking' : playView
  const noncompetitiveModes = visibleQueueModes.filter((mode) => mode !== '5v5')
  const activePlayTab =
    visiblePlayView !== 'matchmaking'
      ? visiblePlayView
      : showWarmup || selectedMode !== '5v5'
        ? 'noncompetitive'
        : 'competitive'
  const matchMapPreview = match
    ? maps.find((map) => map.id === match.mapId)?.previewUrl || localMapPreviews[match.mapId]
    : null

  if (
    (match && (queueStatus === 'countdown' || queueStatus === 'starting_server')) ||
    (queueStatus === 'server_ready' && connectionDetails)
  ) {
    return (
      <main
        data-match-session=""
        className={twMerge(
          'relative flex min-h-[calc(100vh-5rem)] items-center justify-center p-5 text-white sm:p-10 bg-transparent'
        )}
      >
        {queueStatus === 'server_ready' && (
          <div
            className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-neutral-950"
            aria-hidden="true"
          >
            {matchMapPreview && (
              <img
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-[6px]"
                src={matchMapPreview}
                alt=""
                onError={(event) => {
                  const localPreview = match ? localMapPreviews[match.mapId] : undefined
                  event.currentTarget.onerror = null
                  if (localPreview && event.currentTarget.src !== localPreview) {
                    event.currentTarget.src = localPreview
                  } else {
                    event.currentTarget.hidden = true
                  }
                }}
              />
            )}
            <div className="absolute inset-0 bg-black/55" />
            <div className="match-ambient-glow absolute -inset-1/4" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,rgba(0,0,0,0.65)_100%)]" />
          </div>
        )}
        <div className="relative z-10 w-full max-w-5xl">
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase">
              {queueStatus === 'countdown'
                ? 'All players ready'
                : queueStatus === 'starting_server'
                  ? 'Preparing server'
                  : 'In game'}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {match
                ? `${maps.find((map) => map.id === match.mapId)?.displayName ?? match.mapId} · ${getMatchmakingModeLabel(match.mode)}`
                : 'Match in progress'}
            </h1>
            {queueStatus === 'countdown' && (
              <>
                <p className="mt-4 text-7xl font-black tabular-nums text-sky-300">{countdown}</p>
                <p className="mt-2 text-sm text-neutral-400">Game server starting</p>
              </>
            )}
            {queueStatus === 'starting_server' && (
              <p className="mt-5 text-sm text-neutral-400">Waiting for the GoldSrc server…</p>
            )}
          </div>

          {queueStatus === 'server_ready' && match ? (
            <InGameRoster
              className="mt-8"
              matchId={match.matchId}
              teams={match.teams}
              currentPlayerId={player.id}
            />
          ) : match ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <TeamRoster
                name="Team A"
                players={match.teams.teamA}
                readyPlayerIds={acceptedPlayerIds}
              />
              <TeamRoster
                name="Team B"
                players={match.teams.teamB}
                readyPlayerIds={acceptedPlayerIds}
              />
            </div>
          ) : (
            <p className="mt-8 text-center text-sm text-neutral-400" role="status">
              Loading match roster…
            </p>
          )}

          {queueStatus === 'server_ready' && connectionDetails && (
            <div className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-3">
              <Button
                className="w-full "
                disabled={
                  webRuntime
                    ? !manualConnectionAllowed || !retryWindowOpen
                    : !gameExited || !retryWindowOpen
                }
                variant="primary"
                onClick={() => void handleReconnect()}
              >
                {webRuntime
                  ? manualConnectionAllowed
                    ? 'Launch Counter-Strike'
                    : 'Use desktop launcher for ranked'
                  : gameExited
                    ? retryWindowOpen
                      ? 'Reconnect to match'
                      : `Reconnect in ${copyWaitSeconds}s`
                    : 'Counter-Strike is launching…'}
              </Button>
              {manualConnectionAllowed && (
                <div className="flex items-center gap-2">
                  <Button
                    className="w-full gap-2 "
                    disabled={copyConnectionStatus === 'copying' || !retryWindowOpen}
                    variant="secondary"
                    onClick={() => void copyConnection()}
                  >
                    <Copy className="size-4" aria-hidden="true" />
                    {copyWaitSeconds > 0
                      ? `Copy connection in ${copyWaitSeconds}s`
                      : copyConnectionStatus === 'copying'
                        ? 'Activating connection…'
                        : copyConnectionStatus === 'copied'
                          ? 'Copied — copy again'
                          : 'Copy connection'}
                  </Button>
                  <span className="group/backup relative flex shrink-0">
                    <button
                      type="button"
                      className="p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
                      aria-label="Connection backup details"
                      aria-describedby="connection-backup-tooltip"
                    >
                      <CircleHelp className="size-4" aria-hidden="true" />
                    </button>
                    <span
                      id="connection-backup-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute right-0 bottom-[calc(100%+8px)] z-50 w-64   border border-white/15 bg-neutral-950/95 px-3 py-2 text-left text-xs leading-5 text-neutral-200 opacity-0 shadow-2xl transition group-hover/backup:opacity-100 group-focus-within/backup:opacity-100"
                    >
                      Backup: paste the copied command into the Counter-Strike console. Launcher
                      voice and managed skin/audio may need the normal launch flow.
                    </span>
                  </span>
                </div>
              )}
              {currentCustomRoom?.matchId === match?.matchId && (
                <div className="mt-1 border-t border-white/10 pt-3 text-center">
                  <Button
                    className="w-full gap-2 border-red-400/35 text-red-200 hover:border-red-300/60 hover:bg-red-500/10"
                    variant="secondary"
                    disabled={leavingCustomMatch}
                    onClick={() => void handleLeaveCustomMatch()}
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    {leavingCustomMatch ? 'Leaving custom match…' : 'Leave custom match'}
                  </Button>
                  <p className="mt-2 text-xs text-neutral-500">
                    Leaving awards no operation points or daily quest progress.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <main
      data-custom-game-room={visiblePlayView === 'custom' && currentCustomRoom ? '' : undefined}
      data-custom-game-browser={visiblePlayView === 'custom' && !currentCustomRoom ? '' : undefined}
      className={twMerge(
        'play-page relative min-h-0 p-3 text-white sm:p-4',
        visiblePlayView !== 'custom'
          ? 'flex h-full flex-col overflow-hidden pb-20 sm:pb-20'
          : 'min-h-[calc(100vh-5rem)]',
        visiblePlayView === 'custom' &&
          !currentCustomRoom &&
          'lg:h-[calc(100vh-5rem)] lg:overflow-hidden'
      )}
    >
      <div
        className={twMerge(
          'mx-auto w-full max-w-7xl',
          visiblePlayView !== 'custom' && 'flex h-full min-h-0 flex-col',
          visiblePlayView === 'custom' &&
            !currentCustomRoom &&
            'lg:flex lg:h-full lg:min-h-0 lg:flex-col'
        )}
      >
        <header className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-2 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] sm:flex-nowrap">
          <div className="w-full min-w-0 sm:w-auto">
            <h1 className="whitespace-nowrap text-2xl font-semibold text-white sm:text-3xl">
              {visiblePlayView === 'partner'
                ? communityText('servers')
                : visiblePlayView === 'matchmaking'
                  ? 'Find a match'
                  : 'Browse custom games'}
            </h1>
          </div>
          <div
            className={twMerge(
              'flex w-full flex-wrap items-end justify-end gap-x-5 gap-y-2 sm:ml-auto sm:w-auto',
              visiblePlayView === 'partner' && 'hidden'
            )}
          >
            <label
              className={twMerge(
                'flex cursor-pointer items-center gap-2 pb-3 text-xs text-neutral-300',
                visiblePlayView === 'custom' && 'hidden'
              )}
              aria-hidden={visiblePlayView === 'custom'}
            >
              <input
                type="checkbox"
                className="size-4 accent-sky-400"
                checked={!selectedNodeId || allowRegionExpansion}
                disabled={visiblePlayView === 'custom' || isSearching || !selectedNodeId}
                tabIndex={visiblePlayView === 'custom' ? -1 : undefined}
                onChange={(event) => void setAllowRegionExpansion(event.target.checked)}
              />
              {t('activity.searchNearby')}
            </label>
            <div className="w-72 max-w-full shrink-0">
              <div className="flex items-center justify-between gap-3 text-xs text-neutral-200">
                <label className="font-semibold tracking-wide uppercase" htmlFor="play-region">
                  {visiblePlayView === 'custom' ? 'Server' : 'Preferred region'}
                </label>
                <span className="flex items-center gap-2">
                  <span
                    className={twMerge(
                      'size-2 rounded-full bg-neutral-600',
                      isConnected && 'bg-emerald-400'
                    )}
                    aria-hidden="true"
                  />
                  {connectionLabels[connectionStatus]}
                </span>
              </div>
              <MatchmakingRegionSelect
                id="play-region"
                ariaLabel={
                  visiblePlayView === 'custom'
                    ? 'Custom game server'
                    : 'Preferred matchmaking region'
                }
                nodes={nodes}
                selectedNodeId={
                  visiblePlayView === 'custom'
                    ? (currentCustomRoom?.hostNodeId ?? selectedNodeId)
                    : selectedNodeId
                }
                allowAutomatic={visiblePlayView !== 'custom' || !currentCustomRoom}
                disabled={
                  visiblePlayView === 'matchmaking'
                    ? isSearching
                    : movingCustomRoom ||
                      Boolean(
                        currentCustomRoom &&
                        (currentCustomRoom.ownerId !== player?.id ||
                          currentCustomRoom.state !== 'WAITING')
                      )
                }
                showHint={false}
                onChange={(nodeId) => {
                  if (visiblePlayView === 'custom' && currentCustomRoom) {
                    if (nodeId && nodeId !== currentCustomRoom.hostNodeId)
                      void moveCustomRoom(nodeId)
                  } else {
                    void selectNode(nodeId)
                  }
                }}
              />
            </div>
          </div>
        </header>

        <TabList
          className="mt-3 shrink-0"
          ariaLabel={communityText('playModes')}
          value={activePlayTab}
          items={[
            ...(hasCommunityServers
              ? [
                  {
                    value: 'partner' as const,
                    label: communityText('servers'),
                    disabled: isSearching
                  }
                ]
              : []),
            {
              value: 'competitive',
              label: t('play.competitive'),
              helpText: t('matchmaking.modeHelp5v5'),
              disabled: (isSearching && selectedMode !== '5v5') || (!isSearching && !isLeader)
            },
            {
              value: 'noncompetitive',
              label: t('warmup.tab'),
              disabled:
                (isSearching && !warmupEligible && selectedMode === '5v5') ||
                (!isSearching && (!isLeader || noncompetitiveModes.length === 0))
            },
            { value: 'custom', label: t('play.customGame') }
          ]}
          onChange={(view) => {
            if (view === 'custom' || view === 'partner') {
              setPlayView(view)
              return
            }
            setPlayView('matchmaking')
            if (view === 'noncompetitive' && warmupEligible) openWarmup()
            else {
              closeWarmup()
              if (!isSearching) {
                if (view === 'competitive') selectMode('5v5')
                else if (selectedMode === '5v5' && noncompetitiveModes[0])
                  selectMode(noncompetitiveModes[0])
              }
            }
          }}
        />

        {visiblePlayView === 'partner' ? (
          <PartnerServersPanel
            disabled={
              queueStatus !== 'idle' && !(queueStatus === 'queued' && selectedMode === '5v5')
            }
          />
        ) : visiblePlayView === 'matchmaking' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
            {showWarmup ? (
              <QueueWarmupPanel friendsCollapsed={friendsCollapsed} />
            ) : (
              <>
                {selectedMode !== '5v5' && noncompetitiveModes.length > 1 && (
                  <div className="w-64 max-w-full shrink-0">
                    <SelectField
                      label={t('warmup.mode')}
                      value={selectedMode}
                      disabled={isSearching || !isLeader}
                      onChange={(event) => {
                        const mode = noncompetitiveModes.find((mode) => mode === event.target.value)
                        if (mode) selectMode(mode)
                      }}
                    >
                      {noncompetitiveModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {getMatchmakingModeLabel(mode)}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                )}
                <section className="flex min-h-0 flex-1 flex-col" aria-label="Map selection">
                  <div
                    className={twMerge(
                      'mb-2 flex shrink-0 items-center justify-between gap-3',
                      mapsStatus === 'ready' &&
                        !desktopOnlyMode &&
                        availableMaps.length > 0 &&
                        'hidden'
                    )}
                  >
                    <p className="text-[10px] font-bold tracking-[0.18em] text-sky-300 uppercase">
                      Map pool
                    </p>
                    <p className="text-xs text-neutral-200">
                      {desktopOnlyMode
                        ? 'Desktop only'
                        : `${selectedMapIds.length} / ${availableMaps.length} selected`}
                    </p>
                  </div>
                  {mapsStatus === 'ready' && desktopOnlyMode ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center border border-amber-400/25 bg-neutral-950/70 px-5 py-8 text-center">
                      <p className="text-xs font-bold tracking-[0.18em] text-amber-300 uppercase">
                        Desktop client required
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        {getMatchmakingModeLabel(selectedMode)}
                      </h2>
                      <p className="mt-2 max-w-lg text-sm text-neutral-300">
                        1.6 Competitive by Papamo reserves this mode for desktop players. Everyone
                        in your party must use the desktop client before the leader can queue.
                      </p>
                      <a
                        href={desktopAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-5 inline-flex h-10 items-center justify-center border border-sky-300/40 px-5 text-sm font-semibold text-sky-200 transition hover:bg-sky-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                      >
                        Get the desktop client
                      </a>
                    </div>
                  ) : mapsStatus === 'ready' && availableMaps.length > 0 ? (
                    <MatchmakingMapPool
                      maps={availableMaps}
                      selectedMapIds={selectedMapIds}
                      disabled={isSearching || !isLeader}
                      onSelect={selectMap}
                    />
                  ) : (
                    <div className="flex min-h-0 flex-1 items-center justify-center border border-white/10 bg-neutral-950/70 px-4 text-center text-sm text-neutral-300">
                      {mapsStatus === 'loading'
                        ? 'Loading maps…'
                        : mapsStatus === 'error'
                          ? 'Maps could not be loaded.'
                          : partyRequiresWeb && !modeAllowsWeb
                            ? 'This mode is unavailable for Web Play or mixed parties.'
                            : `${getMatchmakingModeLabel(selectedMode)} maps are temporarily unavailable.`}
                    </div>
                  )}
                </section>

                <PlayWindowStatus
                  playWindow={displayedPlayWindowNode(nodes, selectedNodeId)?.playWindow}
                  visible
                  className="w-full max-w-2xl shrink-0 bg-neutral-950/80 px-2 py-1 shadow-lg backdrop-blur-sm max-sm:mb-14"
                />

                <PlayQueueActions friendsCollapsed={friendsCollapsed}>
                  <div className="hidden shrink-0 items-center gap-2 text-right text-xs text-neutral-200 drop-shadow-[0_2px_3px_black] sm:flex">
                    <span>
                      {isLeader
                        ? `${selectedMapIds.length} maps selected`
                        : 'Waiting for party leader'}
                    </span>
                    <span aria-hidden="true">•</span>
                    <PlayerActivity />
                  </div>
                  <FindMatchButton
                    data-audio-sfx="findMatch"
                    data-idle-hint-target="find-match"
                    disabled={
                      !isLeader ||
                      isSearching ||
                      queueStatus === 'joining' ||
                      checkingDiscord ||
                      (partyRequiresWeb && !modeAllowsWeb)
                    }
                    aria-busy={checkingDiscord}
                    aria-label={checkingDiscord ? t('queue.discord.checking') : undefined}
                    onClick={handleFindMatch}
                  >
                    {checkingDiscord && (
                      <LoaderCircle
                        className="absolute left-2 size-4 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">
                      {isSearching
                        ? t('play.searching')
                        : queueStatus === 'joining'
                          ? t('play.joining')
                          : isLeader
                            ? t('warmup.join')
                            : t('play.waitingForLeader')}
                    </span>
                  </FindMatchButton>
                </PlayQueueActions>
              </>
            )}
          </div>
        ) : (
          <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <CustomGamesPanel
              currentPlayerId={player.id}
              maps={maps}
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              disabled={isSearching || !isConnected}
            />
          </div>
        )}
      </div>
      <OfflineQueuePrompt playerId={player.id} />
    </main>
  )
}
