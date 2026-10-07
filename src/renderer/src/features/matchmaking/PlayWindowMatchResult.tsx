import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { MatchRewardSummary } from '../../../../shared/daily-quests'
import { HelpTooltip } from '../../components/ui/HelpTooltip'
import { useTranslation } from '../i18n/i18n'

interface PlayWindowMatchResultProps {
  rewards: MatchRewardSummary | null
  className?: string
}

export function PlayWindowMatchResult({
  rewards,
  className
}: PlayWindowMatchResultProps): JSX.Element {
  const { t } = useTranslation()
  const bonus = rewards?.pointChanges.find((change) => change.source === 'PLAY_WINDOW')
  const status = !rewards
    ? t('matchmaking.playWindowResultUnavailable')
    : bonus
      ? t('matchmaking.playWindowEarned', { points: bonus.amount })
      : t('matchmaking.playWindowNotEarned')
  const tooltip = t('matchmaking.playWindowTooltip')

  return (
    <div
      className={twMerge(
        'inline-flex h-8 w-60 max-w-full items-center justify-between gap-2 border border-white/15 bg-neutral-950/90 px-2 text-xs font-semibold shadow-lg',
        bonus ? 'text-emerald-300' : 'text-neutral-300',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className="truncate">{status}</span>
      <HelpTooltip text={tooltip} placement="top" />
    </div>
  )
}
