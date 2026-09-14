import { ChevronLeft, LoaderCircle, UserRound } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { Button } from '../../components/ui/Button'
import type { PlayerProfile } from '../../../../shared/match-history'
import { getMatchmakingModeLabel } from '../../../../shared/matchmaking'
import { useAuthStore } from '../auth/auth.store'
import type { CompletedMatch } from './matchmaking.store'

export function MatchResultsPage({ match }: { match: CompletedMatch }): React.JSX.Element {
  const currentPlayerId = useAuthStore((state) => state.session?.player.id)
  const winners = match.winner === 1 ? match.teams.teamA : match.teams.teamB
  const losers = match.winner === 1 ? match.teams.teamB : match.teams.teamA
  const currentPlayerTeam = match.teams.teamA.some((player) => player.id === currentPlayerId)
    ? 1
    : match.teams.teamB.some((player) => player.id === currentPlayerId)
      ? 2
      : null
  const didWin = currentPlayerTeam !== null && currentPlayerTeam === match.winner
  const resultLabel = didWin ? 'Victory' : 'Defeat'
  const resultClassName = didWin ? 'text-emerald-300' : 'text-neutral-200'
  const resultsBackgroundClass = didWin
    ? 'bg-[radial-gradient(circle_at_50%_24%,rgba(16,185,129,0.30)_0%,rgba(6,95,70,0.18)_28%,rgba(10,10,10,0.70)_60%,rgba(10,10,10,0.97)_100%)]'
    : 'bg-[radial-gradient(circle_at_50%_24%,rgba(148,163,184,0.22)_0%,rgba(71,85,105,0.14)_30%,rgba(10,10,10,0.74)_60%,rgba(10,10,10,0.97)_100%)]'
  const score =
    currentPlayerTeam === 1
      ? [match.teamAScore, match.teamBScore]
      : currentPlayerTeam === 2
        ? [match.teamBScore, match.teamAScore]
        : match.winner === 1
          ? [match.teamAScore, match.teamBScore]
          : [match.teamBScore, match.teamAScore]
  const [contextMenu, setContextMenu] = useState<{
    playerId: string
    x: number
    y: number
  } | null>(null)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)

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

  const showPlayerMenu = (event: MouseEvent<HTMLElement>, playerId: string): void => {
    event.preventDefault()
    setContextMenu({
      playerId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 176)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 48))
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

  const closeProfile = (): void => {
    setProfile(null)
    setProfileStatus('idle')
    setProfileError(null)
  }

  return (
    <section className="relative min-h-[calc(100vh-5rem)] bg-transparent px-5 py-10 text-center text-white">
      <div
        className={`pointer-events-none fixed inset-0 z-0 ${resultsBackgroundClass}`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.46)_0%,rgba(0,0,0,0.12)_42%,rgba(0,0,0,0.18)_100%)]"
        aria-hidden="true"
      />

      <div className="relative z-10">
        <p className={`text-xs font-bold tracking-[.3em] uppercase ${resultClassName}`}>
          Match complete
        </p>
        <h1 className={`mt-2 text-6xl font-black tracking-[.12em] uppercase ${resultClassName}`}>
          {resultLabel}
        </h1>
        <p className="mt-2 text-3xl font-bold text-white">
          {score[0]} <span className="text-neutral-500">—</span> {score[1]}
        </p>
        <p className="mt-3 text-sm font-semibold tracking-[0.16em] text-neutral-300 uppercase">
          {getMatchmakingModeLabel(match.mode)} · {match.mode === 'casual' ? 'Unranked' : 'Ranked'}
        </p>
        <Team
          label="Winners"
          players={winners}
          stats={match.players}
          ratedMatch={match.mode !== 'casual'}
          onPlayerContextMenu={showPlayerMenu}
        />
        <Team
          label="Opponents"
          players={losers}
          stats={match.players}
          ratedMatch={match.mode !== 'casual'}
          onPlayerContextMenu={showPlayerMenu}
        />
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-40 overflow-hidden rounded-lg border border-white/15 bg-neutral-800 py-1 text-left shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
            role="menuitem"
            onClick={() => openPlayerProfile(contextMenu.playerId)}
          >
            <UserRound className="size-4 text-sky-300" aria-hidden="true" /> View profile
          </button>
        </div>
      )}
      {(profileStatus === 'loading' || profileStatus === 'error' || profile) && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Player profile"
        >
          <section className="w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-neutral-900 text-left shadow-2xl">
            <header className="flex items-start justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">
                  Player profile
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {profile?.username ?? 'Loading player…'}
                </h2>
              </div>
              <Button className="h-9 px-3 text-xs" variant="ghost" onClick={closeProfile}>
                <ChevronLeft className="mr-1 size-4" aria-hidden="true" /> Match results
              </Button>
            </header>
            {profileStatus === 'loading' && (
              <div className="flex min-h-48 items-center justify-center" role="status">
                <LoaderCircle className="size-7 animate-spin text-sky-300" aria-hidden="true" />
              </div>
            )}
            {profileStatus === 'error' && (
              <p className="p-6 text-sm text-rose-300">{profileError}</p>
            )}
            {profile && (
              <>
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
              </>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
function Team({
  label,
  players,
  stats,
  ratedMatch,
  onPlayerContextMenu
}: {
  label: string
  players: CompletedMatch['teams']['teamA']
  stats: CompletedMatch['players']
  ratedMatch: boolean
  onPlayerContextMenu: (event: MouseEvent<HTMLElement>, playerId: string) => void
}): React.JSX.Element {
  return (
    <div className="mx-auto mt-8 max-w-6xl">
      <h2 className="mb-3 text-left text-xs font-bold tracking-[.2em] text-neutral-300 uppercase">
        {label}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {players.map((p) => {
          const playerStats = stats.find((item) => item.id === p.id)
          return (
            <article
              key={p.id}
              className="cursor-context-menu border border-white/15 bg-black/45 p-4 text-left shadow-lg backdrop-blur-sm transition hover:border-white/25 hover:bg-black/55"
              onContextMenu={(event) => onPlayerContextMenu(event, p.id)}
              title="Right-click to view profile"
            >
              <p className="truncate text-lg font-bold text-white">{p.username}</p>
              <p className="mt-5 text-xs text-neutral-400">K / A / D</p>
              <p className="text-xl font-bold text-neutral-200">
                {playerStats
                  ? `${playerStats.kills} / ${playerStats.assists} / ${playerStats.deaths}`
                  : '— / — / —'}
              </p>
              <p className="mt-3 text-xs text-neutral-400">MMR</p>
              <p
                className={`font-mono text-sm font-semibold tabular-nums ${
                  ratedMatch && playerStats
                    ? playerStats.mmrChange > 0
                      ? 'text-emerald-400'
                      : playerStats.mmrChange < 0
                        ? 'text-rose-300'
                        : 'text-neutral-300'
                    : 'text-neutral-300'
                }`}
              >
                {playerStats
                  ? ratedMatch
                    ? `${playerStats.mmrChange >= 0 ? '+' : ''}${playerStats.mmrChange}`
                    : 'Unranked'
                  : '—'}
              </p>
              <p className="mt-3 text-xs text-neutral-400">HS% — · ADR —</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
