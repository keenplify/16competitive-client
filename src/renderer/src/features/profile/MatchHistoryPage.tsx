import { ChevronLeft, LoaderCircle, UserRound } from 'lucide-react'
import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { Button } from '../../components/ui/Button'
import type {
  MatchHistoryEntry,
  MatchSummary,
  MatchSummaryPlayer,
  PlayerProfile
} from '../../../../shared/match-history'

const teamName = (team: string): string => (team === 'team_1' ? 'Team A' : 'Team B')

export function MatchHistoryPage(): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<MatchSummary | null>(null)
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    player: MatchSummaryPlayer
    x: number
    y: number
  } | null>(null)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void window.api.matchHistory
      .get()
      .then((entries) => {
        if (active) {
          setMatches(entries)
          setStatus('ready')
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Could not load match history.')
          setStatus('error')
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const closeContextMenu = (): void => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const openSummary = (match: MatchHistoryEntry): void => {
    setContextMenu(null)
    setSummary(null)
    setSummaryStatus('loading')
    setSummaryError(null)
    void window.api.matchHistory
      .getSummary(match.id)
      .then((loadedSummary) => {
        setSummary(loadedSummary)
        setSummaryStatus('idle')
      })
      .catch((reason: unknown) => {
        setSummaryStatus('error')
        setSummaryError(reason instanceof Error ? reason.message : 'Could not load match summary.')
      })
  }

  const openPlayerProfile = (playerId: string): void => {
    setContextMenu(null)
    setProfile(null)
    setProfileStatus('loading')
    setProfileError(null)
    void window.api.matchHistory
      .getPlayerProfile(playerId)
      .then((loadedProfile) => {
        setProfile(loadedProfile)
        setProfileStatus('idle')
      })
      .catch((reason: unknown) => {
        setProfileStatus('error')
        setProfileError(reason instanceof Error ? reason.message : 'Could not load player profile.')
      })
  }

  const showPlayerMenu = (event: MouseEvent<HTMLDivElement>, entry: MatchSummaryPlayer): void => {
    event.preventDefault()
    setContextMenu({ player: entry, x: event.clientX, y: event.clientY })
  }

  if (profileStatus === 'loading' || profile || profileStatus === 'error') {
    return (
      <main className="min-h-[calc(100vh-5rem)] w-full bg-black/60 p-6 text-white sm:p-10">
        <div className="mx-auto w-full max-w-3xl">
          <Button
            className="h-9 px-3 text-xs"
            variant="ghost"
            onClick={() => {
              setProfile(null)
              setProfileStatus('idle')
              setProfileError(null)
            }}
          >
            <ChevronLeft className="mr-1 size-4" aria-hidden="true" /> Match summary
          </Button>

          {profileStatus === 'loading' && (
            <div className="flex min-h-80 items-center justify-center" role="status">
              <LoaderCircle className="size-7 animate-spin text-sky-300" aria-hidden="true" />
            </div>
          )}
          {profileStatus === 'error' && (
            <p className="mt-8 text-sm text-rose-300">
              {profileError ?? 'Could not load player profile.'}
            </p>
          )}
          {profile && (
            <section className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/90">
              <header className="border-b border-white/10 px-6 py-7">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-sky-400/15 text-sky-300">
                    <UserRound className="size-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">
                      Player profile
                    </p>
                    <h1 className="mt-1 text-3xl font-semibold">{profile.username}</h1>
                  </div>
                </div>
              </header>
              <dl className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4">
                {[
                  ['MMR', profile.mmr],
                  ['Wins', profile.wins],
                  ['Losses', profile.losses],
                  ['K / A / D', `${profile.kills} / ${profile.assists} / ${profile.deaths}`]
                ].map(([label, value]) => (
                  <div key={label} className="p-5">
                    <dt className="text-[10px] font-bold tracking-wide text-neutral-500 uppercase">
                      {label}
                    </dt>
                    <dd className="mt-2 text-lg font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="px-6 py-4 text-xs text-neutral-500">
                Playing since {new Date(profile.createdAt).toLocaleDateString()}
              </p>
            </section>
          )}
        </div>
      </main>
    )
  }

  if (summaryStatus === 'loading' || summary || summaryStatus === 'error') {
    const teams = summary
      ? [
          { id: 'team_1', players: summary.players.filter((entry) => entry.team === 'team_1') },
          { id: 'team_2', players: summary.players.filter((entry) => entry.team === 'team_2') }
        ]
      : []
    return (
      <main className="min-h-[calc(100vh-5rem)] w-full bg-black/60 p-6 text-white sm:p-10">
        <div className="mx-auto w-full max-w-5xl">
          <Button
            className="h-9 px-3 text-xs"
            variant="ghost"
            onClick={() => {
              setSummary(null)
              setSummaryStatus('idle')
              setSummaryError(null)
            }}
          >
            <ChevronLeft className="mr-1 size-4" aria-hidden="true" /> Match history
          </Button>

          {summaryStatus === 'loading' && (
            <div className="flex min-h-80 items-center justify-center" role="status">
              <LoaderCircle className="size-7 animate-spin text-sky-300" aria-hidden="true" />
            </div>
          )}
          {summaryStatus === 'error' && (
            <p className="mt-8 text-sm text-rose-300">
              {summaryError ?? 'Could not load match summary.'}
            </p>
          )}
          {summary && (
            <>
              <header className="mt-6 border-b border-white/10 pb-6 text-center">
                <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">
                  Match complete
                </p>
                <h1 className="mt-2 text-3xl font-semibold uppercase">
                  {summary.mapId} <span className="text-neutral-500">· {summary.mode}</span>
                </h1>
                <p className="mt-3 text-5xl font-black tabular-nums">{summary.score}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  {teamName(summary.winner)} won · {new Date(summary.completedAt).toLocaleString()}
                </p>
              </header>

              <div className="mt-8 grid gap-5 md:grid-cols-2">
                {teams.map(({ id, players }) => (
                  <section
                    key={id}
                    className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900/90"
                  >
                    <h2 className="border-b border-white/10 px-5 py-3 text-sm font-semibold">
                      {teamName(id)}
                    </h2>
                    <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-2 text-[10px] font-bold tracking-wide text-neutral-500 uppercase">
                      <span>Player</span>
                      <span>K / A / D</span>
                    </div>
                    {players.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid cursor-context-menu grid-cols-[1fr_auto] gap-4 border-t border-white/10 px-5 py-3 text-sm transition hover:bg-white/5"
                        onContextMenu={(event) => showPlayerMenu(event, entry)}
                        title="Right-click to view profile"
                      >
                        <span className="font-medium">{entry.username}</span>
                        <span className="font-mono tabular-nums text-neutral-300">
                          {entry.kills} / {entry.assists} / {entry.deaths}
                        </span>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
        {contextMenu && (
          <div
            className="fixed z-50 min-w-40 overflow-hidden rounded-lg border border-white/15 bg-neutral-800 py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
              role="menuitem"
              onClick={() => openPlayerProfile(contextMenu.player.id)}
            >
              <UserRound className="size-4 text-sky-300" aria-hidden="true" /> View profile
            </button>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] w-full bg-black/60 p-6 text-white sm:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="border-b border-white/10 pb-6">
          <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Profile</p>
          <h1 className="mt-2 text-3xl font-semibold">{player?.username ?? 'Player'}</h1>
          <p className="mt-2 text-sm text-neutral-400">Match history</p>
        </header>
        <section className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/90">
          <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-white/10 px-5 py-3 text-xs font-bold tracking-wide text-neutral-500 uppercase">
            <span>Match</span>
            <span>Result</span>
            <span>Score</span>
            <span>Date</span>
          </div>
          {status === 'loading' ? (
            <div className="p-12 text-center text-sm text-neutral-500">Loading matches…</div>
          ) : null}
          {status === 'error' ? (
            <div className="p-12 text-center text-sm text-rose-300">
              {error ?? 'Could not load match history.'}
            </div>
          ) : null}
          {status === 'ready' && matches.length === 0 ? (
            <div className="p-12 text-center text-sm text-neutral-500">
              No completed matches yet.
            </div>
          ) : null}
          {status === 'ready' &&
            matches.map((match) => (
              <button
                key={match.id}
                type="button"
                className="grid w-full grid-cols-[1fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-white/10 px-5 py-4 text-left text-sm transition hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none last:border-0"
                onClick={() => openSummary(match)}
              >
                <span className="font-medium uppercase">
                  {match.mapId} <span className="text-xs text-neutral-500">{match.mode}</span>
                </span>
                <span className={match.result === 'win' ? 'text-emerald-400' : 'text-rose-300'}>
                  {match.result.toUpperCase()}{' '}
                  <span className="text-neutral-400">
                    {match.kills}/{match.assists}/{match.deaths}
                  </span>
                </span>
                <span>{match.score}</span>
                <span className="text-neutral-400">
                  {new Date(match.completedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
        </section>
      </div>
    </main>
  )
}
