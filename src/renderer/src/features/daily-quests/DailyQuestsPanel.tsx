import { Check } from 'lucide-react'
import { MissionReward } from './MissionReward'
import { useEffect, useMemo, useState } from 'react'
import type {
  DailyQuest,
  DailyQuestSnapshot,
  MatchRewardSummary
} from '../../../../shared/daily-quests'
import { twMerge } from 'tailwind-merge'
import { useTranslation } from '../i18n/i18n'

interface DailyQuestsPanelProps {
  snapshot?: DailyQuestSnapshot | null
  rewards?: MatchRewardSummary | null
  loading?: boolean
  error?: string | null
  title?: string
  compact?: boolean
  onRewardOpen?: () => void
  /** Plays the match-result progress reveal after this screen receives focus. */
  revealMatchProgress?: boolean
}

const clampPercent = (progress: number, target: number): number =>
  Math.max(0, Math.min(100, target > 0 ? (progress / target) * 100 : 0))

const resetTime = (resetsAt?: string): string | null => {
  if (!resetsAt) return null
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function DailyQuestsPanel({
  snapshot,
  rewards,
  loading = false,
  error = null,
  title,
  compact = false,
  onRewardOpen,
  revealMatchProgress = false
}: DailyQuestsPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const quests = useMemo<DailyQuest[]>(
    () =>
      [...(rewards?.quests ?? snapshot?.quests ?? [])].sort(
        (a, b) => Number(!!b.endsAt) - Number(!!a.endsAt)
      ),
    [rewards, snapshot]
  )
  const [isFocused, setIsFocused] = useState(() =>
    revealMatchProgress ? document.hasFocus() && !document.hidden : false
  )
  const [revealStarted, setRevealStarted] = useState(false)
  const [revealFinished, setRevealFinished] = useState(false)

  useEffect(() => {
    if (!revealMatchProgress) return
    const beginReveal = (): void => {
      if (!document.hidden) setIsFocused(true)
    }
    window.addEventListener('focus', beginReveal)
    document.addEventListener('visibilitychange', beginReveal)
    return () => {
      window.removeEventListener('focus', beginReveal)
      document.removeEventListener('visibilitychange', beginReveal)
    }
  }, [revealMatchProgress])

  useEffect(() => {
    if (!revealMatchProgress || !isFocused) return
    const frame = window.requestAnimationFrame(() => setRevealStarted(true))
    const finish = window.setTimeout(() => setRevealFinished(true), 1250)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(finish)
    }
  }, [isFocused, revealMatchProgress])

  return (
    <section
      className={twMerge(
        revealMatchProgress
          ? 'w-full max-w-3xl border border-sky-300/15 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.58)]  sm:p-7'
          : 'border border-white/10 p-2 shadow-2xl backdrop-blur-md',
        rewards &&
          twMerge('backdrop-blur-xl', revealMatchProgress ? 'bg-[#080b10]/90' : 'bg-neutral-950/95')
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            {t('mission.progress')}
          </p>
          {rewards && (
            <h2 className="text-lg font-bold text-white">{title ?? t('mission.title')}</h2>
          )}
        </div>
        {rewards ? (
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.14em] text-white/45">
              {t('mission.points')}
            </p>
            <p className="font-mono text-sm font-bold text-white">
              {rewards.pointsBefore.toLocaleString()} → {rewards.pointsAfter.toLocaleString()}
            </p>
          </div>
        ) : snapshot ? (
          <div className="text-right">
            <p className="text-[11px] text-white/40">
              {resetTime(snapshot.resetsAt)
                ? t('mission.reset', { time: resetTime(snapshot.resetsAt)! })
                : ''}
            </p>
          </div>
        ) : null}
      </div>

      <div className="h-72 overflow-y-auto" aria-busy={loading}>
        {loading && quests.length === 0 ? (
          <p className="grid h-full place-items-center text-center text-sm text-white/45">
            {t('mission.loading')}
          </p>
        ) : error && quests.length === 0 ? (
          <p className="grid h-full place-items-center text-center text-sm text-red-300/80">
            {t('mission.error')}
          </p>
        ) : (
          <div className={compact ? 'space-y-2' : 'space-y-3'}>
            {quests.map((quest) => {
              const progress = quest.progress
              const completed = progress >= quest.target
              const matchQuest = rewards?.quests.find(({ id }) => id === quest.id)
              return (
                <article
                  key={quest.id}
                  className={`border px-3 py-3 transition-opacity duration-700 ${
                    revealMatchProgress && matchQuest?.completedThisMatch && revealFinished
                      ? 'border-emerald-400/15 bg-emerald-400/[0.03] opacity-50'
                      : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="flex min-h-10 items-center justify-between gap-4">
                    <p className="min-w-0 flex-1 text-left text-sm font-semibold leading-5 text-white/90">
                      {quest.templateId.startsWith('extra_weekend_') &&
                      quest.metric === 'MATCHES_WON' &&
                      quest.target === 3
                        ? t('mission.weekendObjective')
                        : quest.title}
                    </p>
                    <MissionReward
                      quest={quest}
                      compact
                      onOpen={onRewardOpen}
                      className="ml-auto w-auto justify-end"
                    />
                  </div>
                  <div className="mt-2 flex min-h-4 items-center gap-2">
                    <span className="relative inline-flex shrink-0 items-center text-xs leading-4 tabular-nums text-white/50">
                      <span className={completed ? 'invisible' : undefined} aria-hidden={completed}>
                        {revealMatchProgress && matchQuest
                          ? `${Math.min(matchQuest.progressBefore, quest.target)} → ${Math.min(progress, quest.target)} / ${quest.target}`
                          : `${Math.min(progress, quest.target)} / ${quest.target}`}
                      </span>
                      {completed && (
                        <Check
                          role="img"
                          aria-label={t('mission.complete')}
                          className="absolute left-0 size-4 text-emerald-300"
                          strokeWidth={3}
                        />
                      )}
                    </span>
                    <div className="h-2 min-w-0 flex-1 overflow-hidden bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-sky-300 to-emerald-300 transition-[width] duration-[1100ms] ease-out"
                        style={{
                          width: `${clampPercent(
                            revealMatchProgress && matchQuest && !revealStarted
                              ? matchQuest.progressBefore
                              : progress,
                            quest.target
                          )}%`
                        }}
                      />
                    </div>
                  </div>

                  {revealMatchProgress &&
                    matchQuest &&
                    matchQuest.progressAfter > matchQuest.progressBefore && (
                      <p
                        className={`mt-2 text-right text-xs font-black tracking-wide text-emerald-300 transition-all duration-500 ${
                          revealStarted ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
                        }`}
                      >
                        {t('mission.increment', {
                          amount: matchQuest.progressAfter - matchQuest.progressBefore
                        })}
                      </p>
                    )}
                </article>
              )
            })}
          </div>
        )}
      </div>
      {rewards && rewards.pointChanges.length > 0 && (
        <div
          className={`mt-4 border-t border-white/10 pt-3 transition-all duration-500 ${
            revealMatchProgress && !revealFinished
              ? 'translate-y-3 opacity-0'
              : 'translate-y-0 opacity-100'
          }`}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            {t('mission.matchPoints')}
          </p>
          <div className="space-y-1.5">
            {rewards.pointChanges.map((change, index) => (
              <div
                key={`${change.source}-${change.label}-${index}`}
                className="flex justify-between gap-3 text-sm"
              >
                <span className="text-white/65">
                  {change.source === 'PLAY_WINDOW'
                    ? t('matchmaking.playWindowReward')
                    : change.label}
                </span>
                <span
                  className={
                    change.amount >= 0
                      ? 'font-mono font-black text-emerald-300'
                      : 'font-mono font-bold text-red-300'
                  }
                >
                  {change.amount >= 0 ? '+' : ''}
                  {change.amount} {t('mission.points')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
