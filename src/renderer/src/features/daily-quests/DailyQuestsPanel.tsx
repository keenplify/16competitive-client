import { useEffect, useMemo, useState } from 'react'
import type {
  DailyQuest,
  DailyQuestSnapshot,
  MatchRewardSummary
} from '../../../../shared/daily-quests'
import { twMerge } from 'tailwind-merge'

interface DailyQuestsPanelProps {
  snapshot?: DailyQuestSnapshot | null
  rewards?: MatchRewardSummary | null
  loading?: boolean
  error?: string | null
  title?: string
  compact?: boolean
  /** Plays the match-result progress reveal after this screen receives focus. */
  revealMatchProgress?: boolean
}

const clampPercent = (progress: number, target: number): number =>
  Math.max(0, Math.min(100, target > 0 ? (progress / target) * 100 : 0))

const resetLabel = (resetsAt?: string): string | null => {
  if (!resetsAt) return null
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return null
  return `Resets ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export function DailyQuestsPanel({
  snapshot,
  rewards,
  loading = false,
  error = null,
  title = 'Daily missions',
  compact = false,
  revealMatchProgress = false
}: DailyQuestsPanelProps): React.JSX.Element {
  const quests = useMemo<DailyQuest[]>(
    () => rewards?.quests ?? snapshot?.quests ?? [],
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
            Progress
          </p>
          {rewards && <h2 className="text-lg font-bold text-white">{title}</h2>}
        </div>
        {rewards ? (
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.14em] text-white/45">Points</p>
            <p className="font-mono text-sm font-bold text-white">
              {rewards.pointsBefore.toLocaleString()} → {rewards.pointsAfter.toLocaleString()}
            </p>
          </div>
        ) : snapshot ? (
          <div className="text-right">
            <p className="text-[11px] text-white/40">{resetLabel(snapshot.resetsAt)}</p>
          </div>
        ) : null}
      </div>

      {loading && quests.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">Loading daily missions…</p>
      ) : error && quests.length === 0 ? (
        <p className="py-6 text-center text-sm text-red-300/80">{error}</p>
      ) : (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          {quests.map((quest) => {
            const progress = quest.progress
            const completed = progress >= quest.target
            const matchQuest = rewards?.quests.find(({ id }) => id === quest.id)
            return (
              <article
                key={quest.id}
                className={`border px-2 py-2 transition-opacity duration-700 ${
                  revealMatchProgress && matchQuest?.completedThisMatch && revealFinished
                    ? 'border-emerald-400/15 bg-emerald-400/[0.03] opacity-50'
                    : 'border-white/10 bg-black/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white/90">{quest.title}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {completed ? (
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-emerald-300">
                        Complete
                      </p>
                    ) : (
                      <p className="text-xs font-bold text-amber-200">+{quest.rewardPoints} pts</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="mt-0.5 text-xs text-white/40">
                    {revealMatchProgress && matchQuest
                      ? `${Math.min(matchQuest.progressBefore, quest.target)} → ${Math.min(progress, quest.target)} / ${quest.target}`
                      : `${Math.min(progress, quest.target)} / ${quest.target}`}
                  </p>
                  <div className="h-2 grow overflow-hidden bg-white/10">
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
                      +{matchQuest.progressAfter - matchQuest.progressBefore} PROGRESS
                    </p>
                  )}
                {matchQuest?.completedThisMatch && (
                  <p className="mt-2 text-xs font-semibold text-emerald-300">
                    Mission complete · +{quest.rewardPoints} points
                  </p>
                )}
              </article>
            )
          })}
        </div>
      )}

      {rewards && rewards.pointChanges.length > 0 && (
        <div
          className={`mt-4 border-t border-white/10 pt-3 transition-all duration-500 ${
            revealMatchProgress && !revealFinished
              ? 'translate-y-3 opacity-0'
              : 'translate-y-0 opacity-100'
          }`}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            Points this match
          </p>
          <div className="space-y-1.5">
            {rewards.pointChanges.map((change, index) => (
              <div
                key={`${change.source}-${change.label}-${index}`}
                className="flex justify-between gap-3 text-sm"
              >
                <span className="text-white/65">{change.label}</span>
                <span
                  className={
                    change.amount >= 0
                      ? 'font-mono font-black text-emerald-300'
                      : 'font-mono font-bold text-red-300'
                  }
                >
                  {change.amount >= 0 ? '+' : ''}
                  {change.amount} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
