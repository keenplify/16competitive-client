import type { CompletedMatch } from './matchmaking.store'

export function MatchResultsPage({ match }: { match: CompletedMatch }): React.JSX.Element {
  const winners = match.winner === 1 ? match.teams.teamA : match.teams.teamB
  const losers = match.winner === 1 ? match.teams.teamB : match.teams.teamA
  const score =
    match.winner === 1 ? [match.teamAScore, match.teamBScore] : [match.teamBScore, match.teamAScore]
  return (
    <section className="min-h-[calc(100vh-5rem)] bg-neutral-950/90 px-5 py-10 text-center">
      <p className="text-xs font-bold tracking-[.3em] text-emerald-400 uppercase">Match complete</p>
      <h1 className="mt-2 text-6xl font-black tracking-[.12em] text-emerald-400 uppercase">
        Victory
      </h1>
      <p className="mt-2 text-3xl font-bold">
        {score[0]} <span className="text-neutral-500">—</span> {score[1]}
      </p>
      <Team label="Winners" players={winners} stats={match.players} />
      <Team label="Opponents" players={losers} stats={match.players} />
    </section>
  )
}
function Team({
  label,
  players,
  stats
}: {
  label: string
  players: CompletedMatch['teams']['teamA']
  stats: CompletedMatch['players']
}): React.JSX.Element {
  return (
    <div className="mx-auto mt-8 max-w-6xl">
      <h2 className="mb-3 text-left text-xs font-bold tracking-[.2em] text-neutral-400 uppercase">
        {label}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {players.map((p) => {
          const playerStats = stats.find((item) => item.id === p.id)
          return (
            <article key={p.id} className="border border-white/15 bg-neutral-900/90 p-4 text-left">
              <p className="truncate text-lg font-bold">{p.username}</p>
              <p className="mt-5 text-xs text-neutral-500">K / A / D</p>
              <p className="text-xl font-bold text-neutral-300">
                {playerStats
                  ? `${playerStats.kills} / ${playerStats.assists} / ${playerStats.deaths}`
                  : '— / — / —'}
              </p>
              <p className="mt-3 text-xs text-neutral-500">HS% — · ADR —</p>
              <p className="mt-4 text-xs text-neutral-400">Award pending</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
