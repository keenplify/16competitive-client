import { useMemo } from 'react'
import type {
  DailyQuest,
  DailyQuestSnapshot,
  MatchRewardSummary
} from '../../../../shared/daily-quests'

interface DailyQuestsPanelProps {
  snapshot?: DailyQuestSnapshot | null
  rewards?: MatchRewardSummary | null
  loading?: boolean
  error?: string | null
  title?: string
  compact?: boolean
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
  compact = false
}: DailyQuestsPanelProps): React.JSX.Element {
  const quests = useMemo<DailyQuest[]>(
    () => rewards?.quests ?? snapshot?.quests ?? [],
    [rewards, snapshot]
  )

  return (
    <section className="rounded-xl border border-white/20 bg-black/75 p-4 shadow-2xl backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Progress
          </p>
          <h2 className="text-lg font-bold text-white">{title}</h2>
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
            <p className="font-mono text-sm font-bold text-white">
              {snapshot.points.toLocaleString()} pts
            </p>
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
                className="rounded-lg border border-white/10 bg-black/50 px-3 py-3"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white/90">{quest.title}</p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {Math.min(progress, quest.target)} / {quest.target}
                      {matchQuest && matchQuest.progressAfter > matchQuest.progressBefore
                        ? `  +${matchQuest.progressAfter - matchQuest.progressBefore} this match`
                        : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-amber-200">+{quest.rewardPoints} pts</p>
                    {completed && (
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-emerald-300">
                        Complete
                      </p>
                    )}
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-white/70 transition-[width] duration-700 ease-out"
                    style={{ width: `${clampPercent(progress, quest.target)}%` }}
                  />
                </div>
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
        <div className="mt-4 border-t border-white/10 pt-3">
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
                      ? 'font-mono font-bold text-emerald-300'
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
