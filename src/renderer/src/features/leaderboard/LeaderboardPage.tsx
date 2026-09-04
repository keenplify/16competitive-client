import { Trophy } from 'lucide-react'
import { useEffect, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useLeaderboardStore } from './leaderboard.store'

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )

export function LeaderboardPage(): JSX.Element {
  const leaderboard = useLeaderboardStore((state) => state.leaderboard)
  const status = useLeaderboardStore((state) => state.status)
  const load = useLeaderboardStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="min-h-[calc(100vh-4rem)] w-full bg-neutral-950/75 p-5 text-white sm:min-h-[calc(100vh-5rem)] sm:p-10">
      <header className="mx-auto flex max-w-3xl items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[.2em] text-sky-400 uppercase">Rankings</p>
          <h1 className="mt-2 text-3xl font-semibold">Leaderboard</h1>
          <p className="mt-2 text-sm text-neutral-400">Top players by matchmaking rating</p>
        </div>
        <Button
          variant="ghost"
          className="h-9 px-3 text-xs"
          onClick={() => void load()}
          disabled={status === 'loading'}
        >
          Refresh
        </Button>
      </header>

      {status === 'loading' && !leaderboard && (
        <p className="py-16 text-center text-sm text-neutral-400">Loading leaderboard…</p>
      )}
      {status === 'error' && !leaderboard && (
        <p className="py-16 text-center text-sm text-rose-300">
          Could not load the leaderboard right now.
        </p>
      )}
      {leaderboard && (
        <section className="mx-auto mt-8 max-w-3xl overflow-hidden border border-white/10 bg-neutral-900/90">
          <div className="grid grid-cols-[3.5rem_1fr_auto] gap-4 border-b border-white/10 px-5 py-3 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            <span>Rank</span>
            <span>Player</span>
            <span>MMR</span>
          </div>
          {leaderboard.entries.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-400">
              No ranked players yet.
            </p>
          ) : (
            leaderboard.entries.map((entry) => (
              <div
                key={entry.rank}
                className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 border-b border-white/5 px-5 py-4 last:border-b-0"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-white/5 text-sm font-bold text-amber-300">
                  {entry.rank <= 3 ? (
                    <Trophy className="size-4" aria-label={`Rank ${entry.rank}`} />
                  ) : (
                    entry.rank
                  )}
                </span>
                <span className="truncate font-medium">{entry.username}</span>
                <span className="font-mono text-sm font-semibold text-sky-300">
                  {entry.mmr.toLocaleString()}
                </span>
              </div>
            ))
          )}
          <footer className="border-t border-white/10 px-5 py-3 text-xs text-neutral-500">
            Updated {formatTimestamp(leaderboard.generatedAt)} · Next refresh{' '}
            {formatTimestamp(leaderboard.refreshAt)}
          </footer>
        </section>
      )}
    </main>
  )
}
