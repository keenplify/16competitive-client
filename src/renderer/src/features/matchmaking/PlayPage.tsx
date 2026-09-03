import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  getMatchmakingModeLabel,
  type MatchmakingMap,
  type MatchmakingMode
} from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { usePartyStore } from '../party/party.store'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { useMatchmakingStore } from './matchmaking.store'
import dust2Preview from '../../assets/dust2.jpg'
import { MatchFoundReadyCheck } from './MatchFoundReadyCheck'
import { MatchAssetPreparation } from './MatchAssetPreparation'
import { TeamRoster } from './TeamRoster'

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
        {map.previewUrl || map.id === 'de_dust2' ? (
          <img
            className="h-full w-full object-cover"
            src={map.previewUrl ?? (map.id === 'de_dust2' ? dust2Preview : '')}
            alt=""
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
  const selectedMapId = useMatchmakingStore((state) => state.selectedMapId)
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
  const gameExecutablePath = useGameSettingsStore((state) => state.savedPath)
  const loadGameSettings = useGameSettingsStore((state) => state.load)
  const [secondsToAccept, setSecondsToAccept] = useState(20)

  useEffect(() => {
    void loadMaps()
  }, [loadMaps])

  useEffect(() => {
    void loadRegions()
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

  if (!player) return <main className="min-h-screen bg-neutral-950" />

  const isLeader = !party || party.leaderId === player.id
  const isConnected = connectionStatus === 'ready'
  const isSearching = queueStatus === 'queued' || queueStatus === 'leaving'
  const availableModes = Array.from(
    new Set<MatchmakingMode>(maps.flatMap((map) => map.supportedModes))
  )
  const availableMaps = maps.filter((map) => map.supportedModes.includes(selectedMode))

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

  if (match && ['countdown', 'starting_server', 'server_ready'].includes(queueStatus)) {
    return (
      <main className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center bg-neutral-950/95 p-5 text-white sm:p-10">
        <div className="w-full max-w-5xl">
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase">
              {queueStatus === 'countdown'
                ? 'All players ready'
                : queueStatus === 'starting_server'
                  ? 'Preparing server'
                  : 'Server ready'}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {maps.find((map) => map.id === match.mapId)?.displayName ?? match.mapId} ·{' '}
              {getMatchmakingModeLabel(match.mode)}
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
            {queueStatus === 'server_ready' && connectionDetails && (
              <div className="mx-auto mt-5 max-w-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                Server ready at {connectionDetails.host}:{connectionDetails.port}. The launcher will
                launch Counter-Strike and connect automatically.
              </div>
            )}
          </div>

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

          {queueStatus === 'server_ready' && connectionDetails && (
            <div className="mt-8 flex justify-center">
              <Button variant="ghost" onClick={() => void reconnectGame()}>
                Reconnect to match
              </Button>
            </div>
          )}

          {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}
        </div>
      </main>
    )
  }

  // A client reopened after the match was already prepared receives the
  // connection details but not the original roster. Keep the reconnect action
  // usable instead of trying to read teams from a missing in-memory match.
  if (queueStatus === 'server_ready' && connectionDetails) {
    return (
      <main className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center bg-neutral-950/95 p-5 text-white sm:p-10">
        <section className="w-full max-w-xl rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-8 text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-emerald-300 uppercase">
            Match ready
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Reconnect to your match</h1>
          <p className="mt-3 text-sm text-emerald-100/70">
            The game server is available at {connectionDetails.host}:{connectionDetails.port}.
          </p>
          <Button className="mt-6" onClick={() => void reconnectGame()}>
            Reconnect to match
          </Button>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-neutral-950/92 p-5 text-white sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Matchmaking</p>
            <h1 className="mt-2 text-3xl font-semibold">Choose your battlefield</h1>
            <p className="mt-2 text-sm text-neutral-400">
              {isLeader
                ? 'Select a mode and map for your whole party.'
                : 'Your party leader chooses the mode and map.'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
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
          <section className="mt-8">
            <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Mode</p>
            <div className="mt-3 flex gap-3">
              {availableModes.map((mode) => (
                <Button
                  key={mode}
                  variant="ghost"
                  className={
                    selectedMode === mode
                      ? 'border border-sky-400/50 bg-sky-400/10 text-sky-300'
                      : 'border border-white/10 bg-neutral-900'
                  }
                  disabled={isSearching || !isLeader}
                  onClick={() => selectMode(mode)}
                >
                  {getMatchmakingModeLabel(mode)}
                </Button>
              ))}
            </div>
          </section>

          <section className="mt-8 border-t border-white/10 pt-6">
            <label
              className="block text-xs font-semibold tracking-wide text-neutral-500 uppercase"
              htmlFor="matchmaking-region"
            >
              Preferred region
            </label>
            <select
              id="matchmaking-region"
              className="mt-3 w-full max-w-sm border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-60"
              value={selectedNodeId ?? ''}
              disabled={isSearching}
              onChange={(event) => void selectNode(event.target.value || null)}
            >
              <option value="">Automatic (healthy region)</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id} disabled={!node.available}>
                  {node.region.toUpperCase()} · {node.id}
                  {node.available ? '' : ' (unavailable)'}
                </option>
              ))}
            </select>
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
            <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Maps</p>
            {mapsStatus === 'loading' && (
              <p className="mt-4 text-sm text-neutral-400">Loading maps…</p>
            )}
            {mapsStatus === 'ready' && availableMaps.length === 0 && (
              <p className="mt-4 text-sm text-neutral-400">
                No maps support {getMatchmakingModeLabel(selectedMode)}.
              </p>
            )}
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {availableMaps.map((map) => (
                <MapCard
                  key={map.id}
                  map={map}
                  selected={selectedMapId === map.id}
                  disabled={isSearching || !isLeader}
                  onSelect={() => selectMap(map.id)}
                />
              ))}
            </div>
          </section>

          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-white/10 pt-6">
            <Button
              className="min-w-44"
              disabled={
                !isLeader ||
                !isConnected ||
                !selectedMapId ||
                !gameExecutablePath ||
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
            {isLeader && !gameExecutablePath && (
              <p className="text-sm text-amber-300">
                Choose and save your Counter-Strike executable in Settings first.
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
