import { useEffect, useState, type JSX } from 'react'
import { CircleHelp, Copy } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import {
  allowsManualMatchConnection,
  getMatchmakingModeLabel,
  type MatchmakingMap
} from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
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
        'group overflow-hidden rounded-xl border border-white/10 bg-neutral-900 text-left transition hover:border-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60',
        selected && 'border-sky-400 bg-sky-400/10 ring-2 ring-sky-400/20'
      )}
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="relative flex aspect-[16/8] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.24),transparent_38%),linear-gradient(135deg,#172033,#0a0a0a)]">
        {map.previewUrl || localMapPreviews[map.id] ? (
          <img
            className="h-full w-full object-cover"
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
          <span className="font-audiowide text-3xl text-white/20 uppercase">
            {map.id.slice(0, 2)}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="font-semibold">{map.displayName}</p>
        <p className="mt-1 font-mono text-xs text-neutral-500">{map.id}</p>
      </div>
    </button>
  )
}

export function PlayPage(): JSX.Element {
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
  const [secondsToAccept, setSecondsToAccept] = useState(20)
  const [clockNow, setClockNow] = useState(Date.now)
  const webRuntime = isWebRuntime()

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

  if (!player) return <main className="min-h-screen bg-neutral-950" />

  const isLeader = !party || party.leaderId === player.id
  const isConnected = connectionStatus === 'ready'
  const isSearching = queueStatus === 'queued' || queueStatus === 'leaving'
  const copyWaitSeconds = matchReadyAt
    ? Math.max(0, Math.ceil((matchReadyAt + 10_000 - clockNow) / 1_000))
    : 10
  const retryWindowOpen = copyWaitSeconds === 0
  const manualConnectionAllowed = allowsManualMatchConnection(match?.mode)
  const availableMaps = maps.filter((map) => map.supportedModes.includes(selectedMode))
  const hasSelectedMaps = selectedMapIds.length > 0
  const matchMapPreview = match
    ? maps.find((map) => map.id === match.mapId)?.previewUrl || localMapPreviews[match.mapId]
    : null

  if (match && queueStatus === 'match_found') {
    return (
      <main className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center bg-neutral-950/95 p-5 text-white sm:p-10">
        <section className="w-full max-w-xl border border-sky-400/30 bg-sky-400/10 p-8 text-center">
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
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
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
                className="w-full rounded-sm"
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
                    className="w-full gap-2 rounded-sm"
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
                      className="rounded-full p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
                      aria-label="Connection backup details"
                      aria-describedby="connection-backup-tooltip"
                    >
                      <CircleHelp className="size-4" aria-hidden="true" />
                    </button>
                    <span
                      id="connection-backup-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute right-0 bottom-[calc(100%+8px)] z-50 w-64 rounded border border-white/15 bg-neutral-950/95 px-3 py-2 text-left text-xs leading-5 text-neutral-200 opacity-0 shadow-2xl transition group-hover/backup:opacity-100 group-focus-within/backup:opacity-100"
                    >
                      Backup: paste the copied command into the Counter-Strike console. Launcher
                      voice and managed skin/audio may need the normal launch flow.
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] p-5 text-white sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Matchmaking</p>
            <h1 className="mt-2 text-3xl font-semibold">Choose your battlefield</h1>
            <p className="mt-2 text-sm text-neutral-200">
              {isLeader
                ? `Choose maps for ${getMatchmakingModeLabel(selectedMode)} matchmaking.`
                : `Your party leader chooses the ${getMatchmakingModeLabel(selectedMode)} map pool.`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-200">
            <span
              className={twMerge(
                'size-2 rounded-full bg-neutral-600',
                isConnected && 'bg-emerald-400'
              )}
            />
            {connectionLabels[connectionStatus]}
          </div>
        </header>

        <>
          <section className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs font-semibold tracking-wide text-neutral-200 uppercase">Mode</p>
            <div className="mt-3 flex max-w-xl gap-3">
              {(['5v5', 'unrated'] as const).map((mode) =>
                webRuntime && mode === '5v5' ? (
                  <div
                    key={mode}
                    className="flex-1 rounded border border-white/10 bg-neutral-900 px-4 py-3 text-left text-neutral-300"
                  >
                    <span className="block font-semibold">{getMatchmakingModeLabel(mode)}</span>
                    <span className="mt-1 block text-xs text-neutral-400">
                      Rated matchmaking requires the desktop anti-cheat client.
                    </span>
                    <a
                      href="https://papamo.dev/16competitive#download"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-xs font-semibold text-sky-300 transition hover:text-sky-200 hover:underline"
                    >
                      Download desktop app{' '}
                      <span className="ml-1" aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  </div>
                ) : (
                  <button
                    key={mode}
                    type="button"
                    disabled={isSearching || !isLeader}
                    onClick={() => selectMode(mode)}
                    className={twMerge(
                      'flex-1 rounded border px-4 py-3 text-left transition',
                      selectedMode === mode
                        ? 'border-sky-400 bg-sky-400/10 text-white'
                        : 'border-white/10 bg-neutral-900 text-neutral-300 hover:border-white/25'
                    )}
                  >
                    <span className="block font-semibold">{getMatchmakingModeLabel(mode)}</span>
                    <span className="mt-1 block text-xs text-neutral-400">
                      {mode === '5v5'
                        ? 'Rated. MMR changes and full competitive progression.'
                        : 'Same 5v5 rules, but the result does not change MMR.'}
                    </span>
                  </button>
                )
              )}
            </div>
          </section>

          <section className="mt-8 border-t border-white/10 pt-6">
            <label
              className="block text-xs font-semibold tracking-wide text-neutral-200 uppercase"
              htmlFor="matchmaking-region"
            >
              Preferred region
            </label>
            <MatchmakingRegionSelect
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              disabled={isSearching}
              onChange={(nodeId) => void selectNode(nodeId)}
            />
            <label className="mt-4 flex max-w-xl cursor-pointer items-center gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                className="size-4 accent-sky-400"
                checked={allowRegionExpansion}
                disabled={isSearching}
                onChange={(event) => void setAllowRegionExpansion(event.target.checked)}
              />
              Expand search to other regions after 90 seconds
            </label>
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold tracking-wide text-neutral-200 uppercase">Maps</p>
              {availableMaps.length > 0 && (
                <p className="text-xs text-neutral-200">
                  {selectedMapIds.length} of {availableMaps.length} selected
                </p>
              )}
            </div>
            {mapsStatus === 'loading' && (
              <p className="mt-4 text-sm text-neutral-400">Loading maps…</p>
            )}
            {mapsStatus === 'ready' && availableMaps.length === 0 && (
              <p className="mt-4 text-sm text-neutral-400">
                {getMatchmakingModeLabel(selectedMode)} matchmaking is temporarily unavailable.
              </p>
            )}
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </section>

          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-white/10 pt-6">
            <Button
              className="min-w-44"
              data-audio-sfx="findMatch"
              disabled={
                !isLeader ||
                !isConnected ||
                mapsStatus !== 'ready' ||
                !hasSelectedMaps ||
                (!webRuntime && !gameExecutablePath) ||
                isSearching ||
                queueStatus === 'joining'
              }
              onClick={() => void joinQueue()}
            >
              {isSearching
                ? 'Searching…'
                : queueStatus === 'joining'
                  ? 'Joining queue…'
                  : isLeader
                    ? 'Find match'
                    : 'Waiting for leader'}
            </Button>
            {!isLeader && (
              <p className="text-sm text-neutral-500">
                You’ll be moved into the queue when your leader starts matchmaking.
              </p>
            )}
            {isLeader && !webRuntime && !gameExecutablePath && (
              <p className="text-sm text-amber-300">
                Choose and save your Counter-Strike folder in Settings first.
              </p>
            )}
          </div>
        </>

        <div className="mt-4 min-h-5" aria-live="polite">
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </main>
  )
}
