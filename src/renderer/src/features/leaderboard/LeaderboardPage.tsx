import { ChevronLeft, Globe2, LoaderCircle, Map, Trophy, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { TabList } from '../../components/ui/TabList'
import { useLeaderboardStore } from './leaderboard.store'
import type { PlayerProfile } from '../../../../shared/match-history'
import type { FeaturedRankedLadder } from '../../../../shared/leaderboard'
import { CountryFlag } from '../../components/CountryFlag'

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )

export function LeaderboardPage(): JSX.Element {
  const leaderboard = useLeaderboardStore((state) => state.leaderboard)
  const scope = useLeaderboardStore((state) => state.scope)
  const status = useLeaderboardStore((state) => state.status)
  const playerCountryCode = useLeaderboardStore((state) => state.playerCountryCode)
  const load = useLeaderboardStore((state) => state.load)
  const [activeTab, setActiveTab] = useState<'global' | 'continental' | 'featured'>('global')
  const [featured, setFeatured] = useState<FeaturedRankedLadder | null>(null)
  const [featuredStatus, setFeaturedStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [now, setNow] = useState(() => Date.now())
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const openProfile = (playerId: string): void => {
    setProfile(null)
    setProfileError(null)
    setProfileLoading(true)
    void window.api.matchHistory
      .getPlayerProfile(playerId)
      .then((loaded) => setProfile(loaded))
      .catch((error: unknown) =>
        setProfileError(error instanceof Error ? error.message : 'Could not load player profile.')
      )
      .finally(() => setProfileLoading(false))
  }

  useEffect(() => {
    void load()
    void window.api.leaderboard
      .getFeaturedLadder()
      .then((result) => {
        setFeatured(result)
        setFeaturedStatus('ready')
      })
      .catch((error: unknown) => {
        console.error('[Leaderboard] failed to load featured ladder', error)
        setFeaturedStatus('error')
      })
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const featuredVisible = useMemo(() => {
    if (!featured?.ladder) return false
    return (
      new Date(featured.ladder.publicFrom).getTime() <= now &&
      new Date(featured.ladder.publicUntil).getTime() > now
    )
  }, [featured, now])

  const visibleTab = activeTab === 'featured' && !featuredVisible ? 'global' : activeTab

  const switchScope = (nextScope: 'global' | 'continental' | 'featured'): void => {
    if (nextScope === 'featured') {
      if (featuredVisible) setActiveTab('featured')
      return
    }
    if (nextScope === 'continental' && !playerCountryCode) return
    setActiveTab(nextScope)
    if (nextScope !== scope) {
      void load(nextScope === 'continental' ? (playerCountryCode ?? undefined) : undefined)
    }
  }

  const currentPlayer = leaderboard?.currentPlayer ?? null
  const showCurrentPlayerOutsideTopTen = currentPlayer !== null && currentPlayer.rank > 10
  const displayedEntries = leaderboard
    ? showCurrentPlayerOutsideTopTen
      ? [...leaderboard.entries.slice(0, 9), currentPlayer]
      : leaderboard.entries
    : []

  if (profileLoading || profile || profileError) {
    return (
      <main className="min-h-[calc(100vh-4rem)] w-full p-5 text-white sm:min-h-[calc(100vh-5rem)] sm:p-10">
        <div className="mx-auto max-w-3xl">
          <Button
            variant="ghost"
            className="h-9 px-3 text-xs"
            onClick={() => {
              setProfile(null)
              setProfileError(null)
              setProfileLoading(false)
            }}
          >
            <ChevronLeft className="mr-1 size-4" aria-hidden="true" /> Leaderboard
          </Button>
          {profileLoading && (
            <div className="flex min-h-80 items-center justify-center" role="status">
              <LoaderCircle className="size-7 animate-spin text-sky-300" aria-hidden="true" />
            </div>
          )}
          {profileError && <p className="mt-8 text-sm text-rose-300">{profileError}</p>}
          {profile && (
            <section className="mt-6 overflow-hidden  border border-white/10 bg-neutral-900/90">
              <header className="border-b border-white/10 px-6 py-7">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-sky-400/15 text-sky-300">
                    <UserRound className="size-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">
                      Player profile
                    </p>
                    <div className="mt-1 flex items-center gap-3">
                      <h1 className="text-3xl font-semibold">{profile.username}</h1>
                      <CountryFlag
                        code={profile.flagCountryCode}
                        className="h-[1em] w-auto shrink-0"
                      />
                    </div>
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

  return (
    <main className="min-h-[calc(100vh-4rem)] w-full p-5 text-white sm:min-h-[calc(100vh-5rem)] sm:p-10">
      <header className="mx-auto flex max-w-3xl items-end justify-between gap-4 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
        <div>
          <p className="text-xs font-bold tracking-[.2em] text-sky-400 uppercase">Rankings</p>
          <h1 className="mt-2 text-3xl font-semibold">
            {visibleTab === 'featured' && featured?.ladder
              ? featured.ladder.title
              : 'Leaderboard'}
          </h1>
          <p className="mt-2 text-sm text-neutral-200">
            {visibleTab === 'featured' && featured?.ladder
              ? (featured.ladder.description ?? `Eligible players for ${featured.ladder.title}`)
              : visibleTab === 'continental'
                ? 'Top players on your continent by matchmaking rating'
                : 'Top players worldwide by matchmaking rating'}
          </p>
        </div>
      </header>

      <TabList
        className="mx-auto mt-6 max-w-3xl"
        ariaLabel="Leaderboard scope"
        value={activeTab}
        items={[
          {
            value: 'global',
            label: 'Global',
            icon: <Globe2 className="size-4" aria-hidden="true" />
          },
          {
            value: 'continental',
            label: 'Continental',
            icon: <Map className="size-4" aria-hidden="true" />,
            disabled: !playerCountryCode,
            title: playerCountryCode
              ? 'Your continental leaderboard'
              : 'Set your country in your profile to unlock continental rankings'
          },
          ...(featuredVisible && featured?.ladder
            ? [
                {
                  value: 'featured' as const,
                  label: featured.ladder.title,
                  icon: <Trophy className="size-4" aria-hidden="true" />,
                  title: featured.ladder.description ?? featured.ladder.rewardText ?? 'Challenge'
                }
              ]
            : [])
        ]}
        onChange={switchScope}
      />

      {!playerCountryCode && activeTab === 'global' && leaderboard && (
        <p className="mx-auto mt-3 max-w-3xl text-xs text-neutral-500">
          Set your country in your profile to unlock the continental leaderboard.
        </p>
      )}

      {activeTab === 'featured' && featuredStatus === 'loading' && (
        <p className="py-16 text-center text-sm text-neutral-400">Loading challenge leaderboard…</p>
      )}
      {activeTab === 'featured' && featuredStatus === 'error' && (
        <p className="py-16 text-center text-sm text-rose-300">
          Could not load the challenge leaderboard right now.
        </p>
      )}
      {activeTab === 'featured' && featuredVisible && featured?.ladder && (
        <section className="mx-auto mt-8 max-w-3xl overflow-hidden border border-amber-300/20 bg-neutral-900/90">
          <header className="border-b border-white/10 px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[.18em] text-amber-300 uppercase">
                  Ranked challenge
                </p>
                {featured.ladder.rewardText && (
                  <p className="mt-1 text-sm font-semibold text-amber-200">
                    {featured.ladder.rewardText}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-neutral-400">
                <p>Minimum {featured.ladder.minimumGames} ranked games</p>
                <p>Ends {formatTimestamp(featured.ladder.endsAt)}</p>
              </div>
            </div>
          </header>
          <div className="border-b border-white/10 px-5 py-4 text-sm text-neutral-300">
            <span>Prerequisite: </span>
            <a
              className="font-semibold text-sky-300 underline decoration-sky-300/50 underline-offset-4 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              href="https://discord.gg/uZwKyf2EHp"
              target="_blank"
              rel="noreferrer"
            >
              Join our Discord
            </a>
          </div>
          <div className="grid grid-cols-[3.5rem_1fr_auto_auto] gap-4 border-b border-white/10 px-5 py-3 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            <span>Rank</span>
            <span>Player</span>
            <span>Games</span>
            <span>MMR</span>
          </div>
          {featured.entries.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-400">
              No players have met the eligibility requirement yet.
            </p>
          ) : (
            featured.entries.map((entry) => (
              <div
                key={entry.playerId}
                className="grid grid-cols-[3.5rem_1fr_auto_auto] items-center gap-4 border-b border-white/5 px-5 py-4 last:border-b-0"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-white/5 text-sm font-bold text-amber-300">
                  {entry.rank <= 3 ? (
                    <Trophy className="size-4" aria-label={`Rank ${entry.rank}`} />
                  ) : (
                    entry.rank
                  )}
                </span>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 text-left font-medium hover:text-sky-300 focus-visible:outline-none focus-visible:text-sky-300"
                  onClick={() => openProfile(entry.playerId)}
                  title={`View ${entry.username}'s profile`}
                >
                  <CountryFlag code={entry.flagCountryCode} className="h-[1em] w-auto shrink-0" />
                  <span className="truncate">{entry.username}</span>
                </button>
                <span className="font-mono text-sm text-neutral-300">{entry.gamesPlayed}</span>
                <span className="font-mono text-sm font-semibold text-amber-200">
                  {entry.mmr.toLocaleString()}
                </span>
              </div>
            ))
          )}
          <footer className="border-t border-white/10 px-5 py-3 text-xs text-neutral-500">
            Updated {formatTimestamp(featured.generatedAt)} · Visible until{' '}
            {formatTimestamp(featured.ladder.publicUntil)}
          </footer>
        </section>
      )}

      {activeTab !== 'featured' && status === 'loading' && (
        <p className="py-16 text-center text-sm text-neutral-400">Loading leaderboard…</p>
      )}
      {activeTab !== 'featured' && status === 'error' && (
        <p className="py-16 text-center text-sm text-rose-300">
          Could not load the leaderboard right now.
        </p>
      )}
      {activeTab !== 'featured' && status === 'ready' && leaderboard && (
        <section className="mx-auto mt-8 max-w-3xl overflow-hidden border border-white/10 bg-neutral-900/90">
          <div className="grid grid-cols-[3.5rem_1fr_auto] gap-4 border-b border-white/10 px-5 py-3 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            <span>Rank</span>
            <span>Player</span>
            <span>MMR</span>
          </div>
          {displayedEntries.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-400">
              No ranked players yet.
            </p>
          ) : (
            displayedEntries.map((entry) => (
              <div
                key={entry.playerId}
                className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 border-b border-white/5 px-5 py-4 last:border-b-0"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-white/5 text-sm font-bold text-amber-300">
                  {entry.rank <= 3 ? (
                    <Trophy className="size-4" aria-label={`Rank ${entry.rank}`} />
                  ) : (
                    entry.rank
                  )}
                </span>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 text-left font-medium hover:text-sky-300 focus-visible:outline-none focus-visible:text-sky-300"
                  onClick={() => openProfile(entry.playerId)}
                  title={`View ${entry.username}'s profile`}
                >
                  <CountryFlag code={entry.flagCountryCode} className="h-[1em] w-auto shrink-0" />
                  <span className="truncate">
                    {entry.username}
                    {currentPlayer?.playerId === entry.playerId && (
                      <span className="ml-2 text-[10px] font-bold tracking-wider text-sky-400 uppercase">
                        You
                      </span>
                    )}
                  </span>
                </button>
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
