import { useEffect, useState, type JSX } from 'react'
import type { MatchHistoryEntry } from '../../../../shared/match-history'
import { getMatchmakingModeLabel } from '../../../../shared/matchmaking'
import { useAuthStore } from '../auth/auth.store'
import { useMatchDetailsStore } from './match-details.store'

export function MatchHistoryPage({ showHeader = true }: { showHeader?: boolean }): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
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

  const openSummary = (match: MatchHistoryEntry): void => {
    void useMatchDetailsStore.getState().open(match.id)
  }
  return (
    <main
      className={
        showHeader ? 'min-h-[calc(100vh-5rem)] w-full bg-black/60 p-6 text-white sm:p-10' : 'w-full'
      }
    >
      <div className={showHeader ? 'mx-auto w-full max-w-5xl' : 'w-full'}>
        {showHeader && (
          <header className="border-b border-white/10 pb-6">
            <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Profile</p>
            <h1 className="mt-2 text-3xl font-semibold">{player?.username ?? 'Player'}</h1>
            <p className="mt-2 text-sm text-neutral-400">Match history</p>
          </header>
        )}
        <section className="mt-6 overflow-hidden  border border-white/10 bg-neutral-900/90">
          <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.7fr_0.8fr] gap-4 border-b border-white/10 px-5 py-3 text-xs font-bold tracking-wide text-neutral-500 uppercase">
            <span>Match</span>
            <span>Result</span>
            <span>Score</span>
            <span>MMR</span>
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
                className="grid w-full grid-cols-[1fr_0.8fr_0.8fr_0.7fr_0.8fr] gap-4 border-b border-white/10 px-5 py-4 text-left text-sm transition hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none last:border-0"
                onClick={() => openSummary(match)}
              >
                <span className="font-medium uppercase">
                  {match.mapId}{' '}
                  <span className="text-xs text-neutral-500">
                    {getMatchmakingModeLabel(match.mode)}
                    {match.mode === 'casual' ? ' · Unranked' : ''}
                  </span>
                </span>
                <span className={match.result === 'win' ? 'text-emerald-400' : 'text-rose-300'}>
                  {match.result.toUpperCase()}{' '}
                  <span className="text-neutral-400">
                    {match.kills}/{match.assists}/{match.deaths}
                  </span>
                </span>
                <span>{match.score}</span>
                <span
                  className={
                    match.mode === 'casual' || match.mmrChange === null
                      ? 'text-neutral-500'
                      : match.mmrChange > 0
                        ? 'font-mono font-semibold text-emerald-400'
                        : match.mmrChange < 0
                          ? 'font-mono font-semibold text-rose-300'
                          : 'font-mono text-neutral-400'
                  }
                >
                  {match.mode === 'casual' || match.mmrChange === null
                    ? '—'
                    : `${match.mmrChange >= 0 ? '+' : ''}${match.mmrChange}`}
                </span>
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
