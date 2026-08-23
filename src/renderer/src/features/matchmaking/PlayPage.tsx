import { useEffect, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { useMatchmakingStore } from './matchmaking.store'
import { TeamRoster } from './TeamRoster'

const connectionLabels = {
  disconnected: 'Offline',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  authenticating: 'Authenticating',
  ready: 'Connected'
} as const

export function PlayPage(): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const authStatus = useAuthStore((state) => state.status)
  const logout = useAuthStore((state) => state.logout)
  const connectionStatus = useMatchmakingStore((state) => state.connectionStatus)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const selectedMode = useMatchmakingStore((state) => state.selectedMode)
  const queuedPlayers = useMatchmakingStore((state) => state.queuedPlayers)
  const playersRequired = useMatchmakingStore((state) => state.playersRequired)
  const position = useMatchmakingStore((state) => state.position)
  const match = useMatchmakingStore((state) => state.match)
  const error = useMatchmakingStore((state) => state.error)
  const connect = useMatchmakingStore((state) => state.connect)
  const selectMode = useMatchmakingStore((state) => state.selectMode)
  const joinQueue = useMatchmakingStore((state) => state.joinQueue)
  const leaveQueue = useMatchmakingStore((state) => state.leaveQueue)
  const resetMatchmaking = useMatchmakingStore((state) => state.reset)

  useEffect(() => {
    void connect()
  }, [connect])

  if (!player) return <main className="min-h-screen bg-neutral-950" />

  if (queueStatus === 'matched' && match) {
    return (
      <main className="min-h-screen bg-neutral-950 p-6 text-white sm:p-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase">
            Match found
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Your {match.mode} is ready</h1>
            <span className="font-mono text-xs text-neutral-600">{match.matchId}</span>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <TeamRoster name="Team A" players={match.teams.teamA} />
            <TeamRoster name="Team B" players={match.teams.teamB} />
          </div>
          <p className="mt-6 text-sm text-neutral-500">
            Server preparation and connection details will appear here when available.
          </p>
        </div>
      </main>
    )
  }

  const isConnected = connectionStatus === 'ready'
  const isQueued = queueStatus === 'queued' || queueStatus === 'leaving'
  const progress = playersRequired > 0 ? (queuedPlayers / playersRequired) * 100 : 0

  const handleLogout = async (): Promise<void> => {
    await logout()
    resetMatchmaking()
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-6 text-white sm:p-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/8 pb-6">
          <p className="text-sm font-bold tracking-[0.22em] text-amber-400 uppercase">
            1.6 Competitive
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span
                className={`size-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-neutral-600'}`}
              />
              {connectionLabels[connectionStatus]}
            </div>
            <Button
              className="h-9 px-3"
              variant="ghost"
              disabled={authStatus === 'logging_out'}
              onClick={() => void handleLogout()}
            >
              {authStatus === 'logging_out' ? 'Logging out…' : 'Logout'}
            </Button>
          </div>
        </header>

        <div className="mt-8 grid gap-6 md:grid-cols-[0.7fr_1.3fr]">
          <aside className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Player</p>
            <h1 className="mt-2 text-xl font-semibold">{player.username}</h1>
            <p className="mt-1 truncate text-sm text-neutral-500">{player.email}</p>
            <div className="mt-5 border-t border-white/8 pt-4">
              <span className="text-xs text-neutral-500">MMR</span>
              <p className="text-2xl font-semibold">{player.mmr}</p>
            </div>
          </aside>

          <section className="rounded-xl border border-white/10 bg-neutral-900 p-6 sm:p-8">
            {isQueued ? (
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-amber-400 uppercase">
                  Searching · {selectedMode}
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
                  className="mt-8 w-full"
                  variant="ghost"
                  disabled={queueStatus === 'leaving' || !isConnected}
                  onClick={() => void leaveQueue()}
                >
                  {queueStatus === 'leaving' ? 'Leaving queue…' : 'Leave queue'}
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-neutral-500 uppercase">
                  Matchmaking
                </p>
                <h2 className="mt-3 text-3xl font-semibold">Find a match</h2>
                <p className="mt-2 text-sm text-neutral-500">
                  Select a team size and join the queue.
                </p>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  {(['3v3', '5v5'] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant="ghost"
                      className={
                        selectedMode === mode
                          ? 'border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/10'
                          : 'border border-white/8 bg-black/20'
                      }
                      onClick={() => selectMode(mode)}
                    >
                      {mode}
                    </Button>
                  ))}
                </div>

                <Button
                  className="mt-6 w-full"
                  disabled={!isConnected || queueStatus === 'joining'}
                  onClick={() => void joinQueue()}
                >
                  {queueStatus === 'joining'
                    ? 'Joining queue…'
                    : isConnected
                      ? `Join ${selectedMode} queue`
                      : connectionLabels[connectionStatus]}
                </Button>
              </div>
            )}

            <div className="mt-4 min-h-5" aria-live="polite">
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
