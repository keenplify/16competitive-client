import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { MatchmakingMap } from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { usePartyStore } from '../party/party.store'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { useMatchmakingStore } from './matchmaking.store'
import { TeamRoster } from './TeamRoster'

const connectionLabels = {
  disconnected: 'Offline',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
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
        {map.previewUrl ? (
          <img className="h-full w-full object-cover" src={map.previewUrl} alt="" />
        ) : (
          <span className="font-audiowide text-3xl text-white/20 uppercase">
            {map.id.slice(0, 2)}
          </span>
        )}
        <span className="absolute top-2 right-2 rounded bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wide text-neutral-300 uppercase">
          Placeholder
        </span>
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
  const queuedPlayers = useMatchmakingStore((state) => state.queuedPlayers)
  const playersRequired = useMatchmakingStore((state) => state.playersRequired)
  const position = useMatchmakingStore((state) => state.position)
  const match = useMatchmakingStore((state) => state.match)
  const readyDeadline = useMatchmakingStore((state) => state.readyDeadline)
  const acceptedPlayerIds = useMatchmakingStore((state) => state.acceptedPlayerIds)
  const readyPlayersRequired = useMatchmakingStore((state) => state.readyPlayersRequired)
  const readyResponse = useMatchmakingStore((state) => state.readyResponse)
  const countdown = useMatchmakingStore((state) => state.countdown)
  const connectionDetails = useMatchmakingStore((state) => state.connectionDetails)
  const gameExited = useMatchmakingStore((state) => state.gameExited)
  const error = useMatchmakingStore((state) => state.error)
  const loadMaps = useMatchmakingStore((state) => state.loadMaps)
  const selectMode = useMatchmakingStore((state) => state.selectMode)
  const selectMap = useMatchmakingStore((state) => state.selectMap)
  const joinQueue = useMatchmakingStore((state) => state.joinQueue)
  const leaveQueue = useMatchmakingStore((state) => state.leaveQueue)
  const respondReady = useMatchmakingStore((state) => state.respondReady)
  const reconnectGame = useMatchmakingStore((state) => state.reconnectGame)
  const gameExecutablePath = useGameSettingsStore((state) => state.savedPath)
  const loadGameSettings = useGameSettingsStore((state) => state.load)
  const [secondsToAccept, setSecondsToAccept] = useState(20)

  useEffect(() => {
    void loadMaps()
  }, [loadMaps])

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
  const isQueued = queueStatus === 'queued' || queueStatus === 'leaving'
  const progress = playersRequired > 0 ? (queuedPlayers / playersRequired) * 100 : 0
  const availableMaps = maps.filter((map) => map.supportedModes.includes(selectedMode))
  const selectedMap = maps.find((map) => map.id === selectedMapId)

  if (
    match &&
    ['ready_check', 'countdown', 'starting_server', 'server_ready'].includes(queueStatus)
  ) {
    return (
      <main className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center bg-neutral-950/95 p-5 text-white sm:p-10">
        <div className="w-full max-w-5xl">
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase">
              {queueStatus === 'ready_check'
                ? 'Match found'
                : queueStatus === 'countdown'
                  ? 'All players ready'
                  : queueStatus === 'starting_server'
                    ? 'Preparing server'
                    : 'Server ready'}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {maps.find((map) => map.id === match.mapId)?.displayName ?? match.mapId} ·{' '}
              {match.mode}
            </h1>
            {queueStatus === 'ready_check' && (
              <>
                <p className="mt-4 text-6xl font-black tabular-nums text-white">
                  {secondsToAccept}
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  {acceptedPlayerIds.length} / {readyPlayersRequired} players ready
                </p>
              </>
            )}
            {queueStatus === 'countdown' && (
              <>
                <p className="mt-4 text-7xl font-black tabular-nums text-sky-300">{countdown}</p>
                <p className="mt-2 text-sm text-neutral-400">Game server starting</p>
              </>
            )}
            {queueStatus === 'starting_server' && (
              <p className="mt-5 text-sm text-neutral-400">Waiting for the GoldSrc server…</p>
            )}
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

          {queueStatus === 'ready_check' && (
            <div className="mt-8 flex justify-center gap-3">
              <Button
                className="min-w-40 bg-emerald-500 hover:bg-emerald-400"
                disabled={readyResponse !== 'pending'}
                onClick={() => void respondReady(true)}
              >
                {readyResponse === 'accepted'
                  ? 'Ready ✓'
                  : readyResponse === 'sending'
                    ? 'Sending…'
                    : 'Accept'}
              </Button>
              <Button
                className="min-w-32"
                variant="ghost"
                disabled={readyResponse !== 'pending'}
                onClick={() => void respondReady(false)}
              >
                Decline
              </Button>
            </div>
          )}

          {gameExited && (
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

        {isQueued ? (
          <section className="mt-8 rounded-xl border border-white/10 bg-neutral-900/90 p-6 sm:p-8">
            <p className="text-xs font-bold tracking-[0.18em] text-amber-400 uppercase">
              Searching · {selectedMap?.displayName ?? selectedMapId} · {selectedMode}
            </p>
            <h2 className="mt-3 text-3xl font-semibold">
              {queuedPlayers} / {playersRequired} players
            </h2>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width]"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-neutral-500">Queue position: {position}</p>
            <Button
              className="mt-8 w-full sm:w-auto"
              variant="ghost"
              disabled={queueStatus === 'leaving' || !isConnected}
              onClick={() => void leaveQueue()}
            >
              {queueStatus === 'leaving' ? 'Leaving queue…' : 'Leave queue'}
            </Button>
          </section>
        ) : (
          <>
            <section className="mt-8">
              <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                Team size
              </p>
              <div className="mt-3 flex gap-3">
                {(['3v3', '5v5'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant="ghost"
                    className={
                      selectedMode === mode
                        ? 'border border-sky-400/50 bg-sky-400/10 text-sky-300'
                        : 'border border-white/10 bg-neutral-900'
                    }
                    disabled={!isLeader}
                    onClick={() => selectMode(mode)}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Maps</p>
              {mapsStatus === 'loading' && (
                <p className="mt-4 text-sm text-neutral-400">Loading maps…</p>
              )}
              {mapsStatus === 'ready' && availableMaps.length === 0 && (
                <p className="mt-4 text-sm text-neutral-400">No maps support {selectedMode}.</p>
              )}
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {availableMaps.map((map) => (
                  <MapCard
                    key={map.id}
                    map={map}
                    selected={selectedMapId === map.id}
                    disabled={!isLeader}
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
                  queueStatus === 'joining'
                }
                onClick={() => void joinQueue()}
              >
                {queueStatus === 'joining'
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
        )}

        <div className="mt-4 min-h-5" aria-live="polite">
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </main>
  )
}
