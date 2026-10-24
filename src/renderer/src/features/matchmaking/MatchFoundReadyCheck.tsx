import { useTranslation } from '../i18n/i18n'
import { Check, Info } from 'lucide-react'
import { useEffect, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  getMatchmakingModeLabel,
  type MatchmakingMode,
  type QueuedPlayer
} from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { ProfileRankInsignia } from '../../components/ui/ProfileRankInsignia'
import { useReadyPlayerRanksStore } from './ready-player-ranks.store'

interface MatchFoundReadyCheckProps {
  acceptedPlayerIds: string[]
  match: {
    matchId: string
    mapId: string
    mode: MatchmakingMode
    teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
  }
  playersRequired: number
  readyResponse: 'pending' | 'sending' | 'accepted' | 'declined'
  secondsRemaining: number
  responseError?: boolean
  preparing?: boolean
  onAccept: () => void
  onDecline: () => void
}

function ReadyPlayer({ player, ready }: { player: QueuedPlayer; ready: boolean }): JSX.Element {
  const { t } = useTranslation()
  const rank = useReadyPlayerRanksStore((state) => state.ranks[player.id])
  return (
    <div
      className={twMerge(
        'match-ready-player group relative flex size-10 shrink-0 min-[400px]:size-12 items-center justify-center border-2 transition-[background-color,border-color,box-shadow,color] duration-300 motion-reduce:transition-none sm:size-14',
        ready
          ? 'border-emerald-300 bg-emerald-400/25 text-white shadow-[0_0_0_3px_rgba(34,197,94,0.18),0_0_18px_rgba(34,197,94,0.65)]'
          : 'border-white/10 bg-black/45 text-white/20'
      )}
      data-ready={ready}
      role="listitem"
      aria-label={t('match.ready.playerStatus', {
        player: player.username,
        status: t(ready ? 'match.ready.accepted' : 'match.ready.pending')
      })}
      title={
        rank
          ? `${player.username} · ${rank.levelTitle}`
          : `${player.username} · ${t('match.ready.rankUnavailable')}`
      }
    >
      {rank ? (
        <ProfileRankInsignia
          level={rank.level}
          title={rank.levelTitle}
          ariaLabel={t('match.ready.rank', { level: rank.level, title: rank.levelTitle })}
          className="size-8 min-[400px]:size-9 sm:size-10"
        />
      ) : (
        <span
          className="flex size-8 items-center justify-center text-lg text-white/40"
          aria-label={t('match.ready.rankUnavailable')}
        >
          ?
        </span>
      )}
      {ready && (
        <span className="match-ready-status-check hidden" aria-hidden="true">
          <Check className="size-3" />
        </span>
      )}
      <span className="sr-only">{player.username}</span>
    </div>
  )
}

export function MatchFoundReadyCheck({
  acceptedPlayerIds,
  match,
  playersRequired,
  readyResponse,
  secondsRemaining,
  responseError = false,
  preparing = false,
  onAccept,
  onDecline
}: MatchFoundReadyCheckProps): JSX.Element {
  const { t } = useTranslation()
  const loadRanks = useReadyPlayerRanksStore((state) => state.load)
  useEffect(() => {
    void loadRanks(match.matchId, [...match.teams.teamA, ...match.teams.teamB])
  }, [loadRanks, match.matchId, match.teams])
  const mapName = match.mapId.replace(/^de_/, '').replace(/_/g, ' ')
  const mapDisplayName = mapName.replace(/\b\w/g, (letter) => letter.toUpperCase())
  const timeLeft = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`

  return (
    <div className="match-ready-check w-full min-w-0 text-white">
      <div className="match-ready-window-title hidden">{t('match.ready.windowTitle')}</div>
      <div className="my-auto w-full max-w-[46rem] min-w-0">
        <section className="match-ready-card relative border-4 border-emerald-400 bg-[linear-gradient(110deg,rgba(3,51,25,0.92),rgba(3,28,20,0.88))] p-4 shadow-[0_0_0_3px_rgba(34,197,94,0.2),0_16px_45px_rgba(0,0,0,0.6),inset_0_0_45px_rgba(0,0,0,0.45)] sm:p-6">
          <header className="text-center">
            <h1
              id="match-ready-title"
              className="inline-block border-b border-emerald-300/70 pb-1 text-2xl font-light tracking-wide text-emerald-200 sm:text-3xl"
            >
              YOUR MATCH IS READY!
            </h1>
            <p className="match-ready-map mt-3 text-sm font-medium text-emerald-200/85">
              {getMatchmakingModeLabel(match.mode)} · {mapDisplayName}
            </p>
          </header>

          {responseError && (
            <div className="absolute inset-x-4 top-4 z-10 sm:inset-x-6" role="alert">
              <p className="border border-amber-300/40 bg-neutral-950/95 px-4 py-3 text-center text-sm text-amber-100 shadow-xl">
                {t('match.ready.responseError')}
              </p>
            </div>
          )}

          <div
            className="mt-5 flex flex-wrap justify-center gap-2.5 sm:gap-3"
            role="group"
            aria-label={t('match.ready.playerList')}
          >
            {[match.teams.teamA, match.teams.teamB].map((team, teamIndex) => (
              <div
                key={teamIndex}
                className="flex shrink-0 flex-nowrap justify-center gap-1.5 min-[400px]:gap-2.5 sm:gap-3"
                role="list"
                aria-label={t('match.ready.team', { team: teamIndex + 1 })}
              >
                {team.map((player) => (
                  <ReadyPlayer
                    key={player.id}
                    player={player}
                    ready={acceptedPlayerIds.includes(player.id)}
                  />
                ))}
              </div>
            ))}
          </div>

          <p className="match-ready-count mt-4 text-center text-sm font-medium text-emerald-200">
            {preparing
              ? 'Preparing ready check'
              : `${acceptedPlayerIds.length} / ${playersRequired} Players Ready`}
          </p>

          <div className="match-ready-timer mt-4 text-center">
            <p className="font-mono text-3xl font-bold tabular-nums text-emerald-200">
              {preparing ? '—:—' : timeLeft}
            </p>
            <p className="mt-1 text-xs tracking-[0.14em] text-emerald-100/65 uppercase">
              {t('match.ready.timerLabel')}
            </p>
          </div>

          {match.mode === '5v5' && (
            <aside className="match-ready-handoff mt-5 border border-amber-300/40 bg-amber-950/50 p-4 text-sm leading-relaxed text-amber-100">
              <h2 className="font-semibold">{t('match.ready.handoffTitle')}</h2>
              <p className="mt-1">{t('match.ready.handoffDetails')}</p>
              <p className="mt-2">{t('match.ready.handoffMmr')}</p>
            </aside>
          )}

          <div className="match-ready-actions mt-5 flex flex-wrap justify-center gap-3">
            <Button
              className="min-w-40 rounded-none bg-emerald-400 text-base font-extrabold text-emerald-950 shadow-[0_4px_0_rgb(5,100,55)] hover:bg-emerald-300 disabled:bg-emerald-400/50"
              disabled={preparing || readyResponse !== 'pending'}
              onClick={onAccept}
            >
              {readyResponse === 'accepted'
                ? 'ACCEPTED'
                : readyResponse === 'sending'
                  ? 'SENDING…'
                  : 'ACCEPT'}
            </Button>
            <Button
              className="min-w-28 rounded-none border border-white/15 px-6 text-white/65 hover:border-white/35"
              variant="ghost"
              disabled={preparing || readyResponse !== 'pending'}
              onClick={onDecline}
            >
              DECLINE
            </Button>
          </div>
          <div
            className="mt-4 grid text-center text-sm leading-relaxed text-emerald-100"
            role="status"
          >
            {(['pending', 'accepted'] as const).map((state) => (
              <p
                key={state}
                className={twMerge(
                  'col-start-1 row-start-1',
                  (readyResponse === 'accepted') !== (state === 'accepted') && 'invisible'
                )}
                aria-hidden={(readyResponse === 'accepted') !== (state === 'accepted')}
              >
                {t(
                  state === 'accepted'
                    ? 'match.ready.decisionAccepted'
                    : 'match.ready.decisionPending'
                )}
              </p>
            ))}
          </div>
        </section>

        <aside className="match-ready-note mt-3 flex gap-4 bg-black/85 px-5 py-3 text-xs leading-relaxed text-white/80 shadow-xl sm:px-6">
          <Info className="mt-0.5 size-5 shrink-0 text-white" aria-hidden="true" />
          <p>
            By accepting, you commit to this match. Leaving after acceptance may result in a
            penalty. Please ensure you are ready to play before continuing.
          </p>
        </aside>
      </div>
    </div>
  )
}
