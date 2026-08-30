import { useEffect, useState, type JSX } from 'react'
import { useAuthStore } from '../auth/auth.store'
import type { MatchHistoryEntry } from '../../../../shared/match-history'

export function MatchHistoryPage(): JSX.Element {
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
          <div className="p-12 text-center text-sm text-neutral-500">No completed matches yet.</div>
        ) : null}
        {status === 'ready' &&
          matches.map((match) => (
            <div
              key={match.id}
              className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-white/10 px-5 py-4 text-sm last:border-0"
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
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
