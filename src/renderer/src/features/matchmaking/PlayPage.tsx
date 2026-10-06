import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import { Check, CircleHelp, Copy, LogOut } from 'lucide-react'
import { toast } from 'react-toastify'
import { twMerge } from 'tailwind-merge'
import {
  allowsManualMatchConnection,
  getMatchmakingModeLabel,
  type MatchmakingMap
} from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { TabList } from '../../components/ui/TabList'
import { useAuthStore } from '../auth/auth.store'
import { CustomGamesPanel } from './CustomGamesPanel'
import { useCustomGamesStore } from './custom-games.store'
import { usePartyStore } from '../party/party.store'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useMatchmakingStore } from './matchmaking.store'
import { MatchFoundReadyCheck } from './MatchFoundReadyCheck'
import { MatchAssetPreparation } from './MatchAssetPreparation'
import { TeamRoster } from './TeamRoster'
import { InGameRoster } from './InGameRoster'
import { MatchmakingRegionSelect } from './MatchmakingRegionSelect'
import { localMapPreviews } from './map-previews'
import { isWebRuntime } from '../../web-runtime'

const connectionLabels = {
  disconnected: 'Offline',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  handoff: 'Connecting to match region',
  authenticating: 'Authenticating',
  ready: 'Connected'
} as const

interface MapCardProps {
  map: MatchmakingMap
  selected: boolean
  disabled: boolean
  onSelect: () => void
}

function MapCard({ map, selected, disabled, onSelect }: MapCardProps): JSX.Element {
  return (
    <button
      type="button"
      className={twMerge(
        'group relative h-full min-h-0 overflow-hidden border border-white/20 bg-neutral-900 text-left shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition duration-200 hover:border-sky-300 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-60',
        selected && 'border-sky-300 ring-2 ring-sky-300/40'
      )}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${map.displayName}, ${selected ? 'selected' : 'not selected'}`}
      onClick={onSelect}
    >
      <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.24),transparent_38%),linear-gradient(135deg,#172033,#0a0a0a)]">
        {map.previewUrl || localMapPreviews[map.id] ? (
          <img
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            src={map.previewUrl ?? localMapPreviews[map.id]}
            alt=""
            onError={(event) => {
              const localPreview = localMapPreviews[map.id]
              event.currentTarget.onerror = null
              if (localPreview && event.currentTarget.src !== localPreview) {
                event.currentTarget.src = localPreview
              } else {
                event.currentTarget.hidden = true
              }
            }}
          />
        ) : (
          <span className="font-audiowide text-4xl text-white/25 uppercase">
            {map.displayName.slice(0, 2)}
          </span>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-black/20" />
      <div className="absolute top-2 right-2 flex size-6 items-center justify-center border border-white/70 bg-black/60 text-white">
        {selected && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
      </div>
      <div className="absolute inset-x-0 bottom-0 px-3 pb-3 text-center drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]">
        <p className="font-audiowide text-sm leading-tight text-white uppercase sm:text-base">
          {map.displayName}
        </p>
        <p className="mt-1 font-mono text-[10px] text-white/75">{map.id}</p>
      </div>
    </button>
  )
}

export function PlayPage({
  friendsCollapsed = false
}: {
  friendsCollapsed?: boolean
}): JSX.Element {
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
  const preferHumans = useMatchmakingStore((state) => state.preferHumans)
  const setPreferHumans = useMatchmakingStore((state) => state.setPreferHumans)
  const match = useMatchmakingStore((state) => state.match)
  const readyDeadline = useMatchmakingStore((state) => state.readyDeadline)
  const acceptedPlayerIds = useMatchmakingStore((state) => state.acceptedPlayerIds)
  const readyPlayersRequired = useMatchmakingStore((state) => state.readyPlayersRequired)
  const readyResponse = useMatchmakingStore((state) => state.readyResponse)
  const countdown = useMatchmakingStore((state) => state.countdown)
  const assetPreparation = useMatchmakingStore((state) => state.assetPreparation)
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
  const respondReady = useMatchmakingStore((state) => state.respondReady)
  const reconnectGame = useMatchmakingStore((state) => state.reconnectGame)
  const copyConnection = useMatchmakingStore((state) => state.copyConnection)
  const copyConnectionStatus = useMatchmakingStore((state) => state.copyConnectionStatus)
  const matchReadyAt = useMatchmakingStore((state) => state.matchReadyAt)
  const gameExecutablePath = useGameSettingsStore((state) => state.savedPath)
  const loadGameSettings = useGameSettingsStore((state) => state.load)
  const navigate = useNavigationStore((state) => state.navigate)
  const playView = useCustomGamesStore((state) => state.playView)
  const setPlayView = useCustomGamesStore((state) => state.setPlayView)
  const currentCustomRoom = useCustomGamesStore((state) => state.currentRoom)
  const moveCustomRoom = useCustomGamesStore((state) => state.moveServer)
  const movingCustomRoom = useCustomGamesStore((state) => state.movingServer)
  const leaveCustomRoom = useCustomGamesStore((state) => state.leaveRoom)
  const restoreCustomRoom = useCustomGamesStore((state) => state.restoreRoom)
  const customRoomError = useCustomGamesStore((state) => state.error)
  const [secondsToAccept, setSecondsToAccept] = useState(120)
  const [clockNow, setClockNow] = useState(Date.now)
  const [leavingCustomMatch, setLeavingCustomMatch] = useState(false)
  const webRuntime = isWebRuntime()

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
    if (customRoomError) toast.error(customRoomError)
  }, [customRoomError])

  useEffect(() => {
    if (queueStatus !== 'ready_check' || !readyDeadline) return
    const update = (): void => {
      setSecondsToAccept(
        Math.max(0, Math.ceil((new Date(readyDeadline).getTime() - Date.now()) / 1_000))
      )
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [queueStatus, readyDeadline])

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
    if (selectedMode === '5v5' && rankedBlockedForHost) {
      toast.error(rankedBlockReason)
      return
    }
    void joinQueue()
  }

  if (!player) return <main className="min-h-screen bg-neutral-950" />

  const isLeader = !party || party.leaderId === player.id
  const nonDesktopPartyMembers =
    party?.members.filter(({ clientMode }) => clientMode !== 'desktop') ?? []
  const rankedBlockedForHost = isLeader && (webRuntime || nonDesktopPartyMembers.length > 0)
  const rankedBlockReason =
    nonDesktopPartyMembers.length > 0
      ? `${nonDesktopPartyMembers
          .map(
            ({ username, clientMode }) =>
              `${username} (${clientMode === 'web' ? 'Web Play' : 'offline'})`
          )
          .join(
            ', '
          )} ${nonDesktopPartyMembers.length === 1 ? 'is' : 'are'} not connected through Papamo Guard.`
      : 'Rated matchmaking requires the Papamo Guard desktop client.'
  const isConnected = connectionStatus === 'ready'
  const isSearching = queueStatus === 'queued' || queueStatus === 'leaving'
  const copyWaitSeconds = matchReadyAt
    ? Math.max(0, Math.ceil((matchReadyAt + 10_000 - clockNow) / 1_000))
    : 10
  const retryWindowOpen = copyWaitSeconds === 0
  const manualConnectionAllowed = allowsManualMatchConnection(match?.mode)
  const hasLegacyMaps = maps.some((map) => map.supportedModes.includes('legacy'))
  const availableMaps = maps.filter((map) => map.supportedModes.includes(selectedMode))
  const smallMapColumns = Math.max(1, Math.ceil(availableMaps.length / 2))
  const wideMapColumns =
    availableMaps.length <= 12
      ? Math.max(1, Math.min(6, availableMaps.length))
      : Math.ceil(availableMaps.length / 2)
  const hasSelectedMaps = selectedMapIds.length > 0
  const matchMapPreview = match
    ? maps.find((map) => map.id === match.mapId)?.previewUrl || localMapPreviews[match.mapId]
    : null

  if (match && queueStatus === 'match_found') {
    return (
      <main className="relative flex h-full min-h-0 min-w-0 items-center justify-center overflow-x-hidden overflow-y-auto bg-neutral-950/95 p-4 text-white sm:p-6">
        <section className="my-auto w-full max-w-xl border border-sky-400/30 bg-sky-400/10 p-8 text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-sky-300 uppercase">Match found</p>
          <h1 className="mt-3 text-3xl font-semibold">Preparing ready check</h1>
          <p className="mt-3 text-sm text-sky-100/70">
            {maps.find((map) => map.id === match.mapId)?.displayName ?? match.mapId} ·{' '}
            {getMatchmakingModeLabel(match.mode)}
          </p>
          <MatchAssetPreparation
            className="mx-auto mt-5 max-w-md text-left"
            preparation={assetPreparation}
          />
          <p className="mt-5 text-sm text-neutral-400">
            Waiting for the server to open player acceptance…
          </p>
        </section>
      </main>
    )
  }

  if (match && queueStatus === 'ready_check') {
    return (
      <MatchFoundReadyCheck
        acceptedPlayerIds={acceptedPlayerIds}
        match={match}
        playersRequired={readyPlayersRequired}
        readyResponse={readyResponse}
        secondsRemaining={secondsToAccept}
        assetPreparation={assetPreparation}
        onAccept={() => void respondReady(true)}
        onDecline={() => void respondReady(false)}
      />
    )
  }

  if (
    (match && (queueStatus === 'countdown' || queueStatus === 'starting_server')) ||
    (queueStatus === 'server_ready' && connectionDetails)
  ) {
    return (
      <main
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
            <MatchAssetPreparation
              className="mx-auto mt-5 max-w-md"
              preparation={assetPreparation}
            />
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
                disabled={webRuntime ? !manualConnectionAllowed : !gameExited || !retryWindowOpen}
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
      className={twMerge(
        'relative min-h-0 p-3 text-white sm:p-4',
        playView === 'matchmaking'
          ? 'flex h-full flex-col overflow-hidden pb-20 sm:pb-20'
          : 'min-h-[calc(100vh-5rem)]',
        playView === 'custom' && !currentCustomRoom && 'lg:h-[calc(100vh-5rem)] lg:overflow-hidden'
      )}
    >
      <div
        className={twMerge(
          'mx-auto w-full max-w-7xl',
          playView === 'matchmaking' && 'flex h-full min-h-0 flex-col',
          playView === 'custom' && !currentCustomRoom && 'lg:flex lg:h-full lg:min-h-0 lg:flex-col'
        )}
      >
        <header className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-2 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
          <div className="w-full sm:w-80">
            <h1 className="whitespace-nowrap text-2xl font-semibold text-white sm:text-3xl">
              {playView === 'matchmaking' ? 'Find a match' : 'Browse custom games'}
            </h1>
          </div>
          <div className="flex w-full flex-wrap items-end justify-end gap-x-5 gap-y-2 sm:w-auto">
            <label
              className={twMerge(
                'flex cursor-pointer items-center gap-2 pb-3 text-xs text-neutral-300',
                playView === 'custom' && 'invisible pointer-events-none'
              )}
              aria-hidden={playView === 'custom'}
            >
              <input
                type="checkbox"
                className="size-4 accent-emerald-400"
                checked={preferHumans}
                disabled={playView === 'custom' || isSearching}
                tabIndex={playView === 'custom' ? -1 : undefined}
                onChange={(event) => setPreferHumans(event.target.checked)}
              />
              Prefer humans
            </label>
            <label
              className={twMerge(
                'flex cursor-pointer items-center gap-2 pb-3 text-xs text-neutral-300',
                playView === 'custom' && 'invisible pointer-events-none'
              )}
              aria-hidden={playView === 'custom'}
            >
              <input
                type="checkbox"
                className="size-4 accent-sky-400"
                checked={allowRegionExpansion}
                disabled={playView === 'custom' || isSearching}
                tabIndex={playView === 'custom' ? -1 : undefined}
                onChange={(event) => void setAllowRegionExpansion(event.target.checked)}
              />
              Expand search after 90 seconds
            </label>
            <div className="w-72">
              <div className="flex items-center justify-between gap-3 text-xs text-neutral-200">
                <label className="font-semibold tracking-wide uppercase" htmlFor="play-region">
                  {playView === 'custom' ? 'Server' : 'Preferred region'}
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
                  playView === 'custom' ? 'Custom game server' : 'Preferred matchmaking region'
                }
                nodes={nodes}
                selectedNodeId={
                  playView === 'custom'
                    ? (currentCustomRoom?.hostNodeId ?? selectedNodeId)
                    : selectedNodeId
                }
                allowAutomatic={playView !== 'custom' || !currentCustomRoom}
                disabled={
                  playView === 'matchmaking'
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
                  if (playView === 'custom' && currentCustomRoom) {
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
          ariaLabel="Play modes"
          value={playView}
          items={[
            { value: 'matchmaking', label: 'Matchmaking' },
            { value: 'custom', label: 'Custom game' }
          ]}
          onChange={setPlayView}
        />

        {playView === 'matchmaking' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
            <TabList
              className="shrink-0"
              ariaLabel="Matchmaking mode"
              value={selectedMode}
              items={(['5v5', 'unrated', 'legacy', 'ffa'] as const)
                .filter((mode) => mode !== 'legacy' || hasLegacyMaps)
                .map((mode) => ({
                  value: mode,
                  label: getMatchmakingModeLabel(mode),
                  disabled: isSearching || !isLeader,
                  title:
                    mode === '5v5'
                      ? 'Rated 5v5 with MMR progression'
                      : mode === 'ffa'
                        ? 'Drop-in deathmatch, first to 50 kills'
                        : mode === 'legacy'
                          ? 'Unrated 5v5 with CS 1.3 movement'
                          : 'Unrated 5v5 without MMR changes'
                }))}
              onChange={(mode) => {
                if (mode === '5v5' && rankedBlockedForHost) toast.error(rankedBlockReason)
                else selectMode(mode)
              }}
            />

            <section className="flex min-h-0 flex-1 flex-col" aria-label="Map selection">
              <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                <p className="text-[10px] font-bold tracking-[0.18em] text-sky-300 uppercase">
                  Map pool
                </p>
                <p className="text-xs text-neutral-200">
                  {selectedMapIds.length} / {availableMaps.length} selected
                </p>
              </div>
              {mapsStatus === 'ready' && availableMaps.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
                  <div
                    className="play-map-grid grid h-full min-h-0 gap-2"
                    style={
                      {
                        '--play-map-columns-small': smallMapColumns,
                        '--play-map-columns-wide': wideMapColumns,
                        '--play-map-min-width-small': `${smallMapColumns * 136}px`,
                        '--play-map-min-width-wide': `${wideMapColumns * 150}px`
                      } as CSSProperties
                    }
                  >
                    {availableMaps.map((map) => (
                      <MapCard
                        key={map.id}
                        map={map}
                        selected={selectedMapIds.includes(map.id)}
                        disabled={isSearching || !isLeader}
                        onSelect={() => selectMap(map.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center border border-white/10 bg-neutral-950/70 px-4 text-center text-sm text-neutral-300">
                  {mapsStatus === 'loading'
                    ? 'Loading maps…'
                    : mapsStatus === 'error'
                      ? 'Maps could not be loaded.'
                      : `${getMatchmakingModeLabel(selectedMode)} maps are temporarily unavailable.`}
                </div>
              )}
            </section>

            <div
              className={twMerge(
                'fixed right-4 bottom-4 z-40 flex items-center gap-3 sm:bottom-6',
                friendsCollapsed ? 'md:right-[3.75rem]' : 'md:right-[19rem]'
              )}
            >
              <span className="hidden max-w-56 text-right text-xs text-neutral-200 drop-shadow-[0_2px_3px_black] sm:block">
                {isLeader ? `${selectedMapIds.length} maps selected` : 'Waiting for party leader'}
              </span>
              <Button
                className="play-find-match-cta relative h-12 min-w-40 overflow-hidden border border-green-600 bg-[#064b0b] px-6 font-sans text-[17px] font-extrabold tracking-[0.18em] text-lime-400 uppercase hover:bg-[#075a0d] focus-visible:outline-lime-400 disabled:bg-[#064b0b] disabled:text-lime-600"
                data-audio-sfx="findMatch"
                data-idle-hint-target="find-match"
                disabled={!isLeader || isSearching || queueStatus === 'joining'}
                onClick={handleFindMatch}
              >
                <span className="relative z-10">
                  {isSearching
                    ? 'Searching…'
                    : queueStatus === 'joining'
                      ? 'Joining…'
                      : isLeader
                        ? 'Find match'
                        : 'Waiting for leader'}
                </span>
              </Button>
            </div>
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
    </main>
  )
}
