import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { useMatchmakingStore } from './matchmaking.store'
import { useTranslation } from '../i18n/i18n'

export function PlayerActivity({ className }: { className?: string }): JSX.Element {
  const activity = useMatchmakingStore((state) => state.activity)
  const { t } = useTranslation()
  return (
    <span className={twMerge('inline-block min-w-48 tabular-nums', className)} aria-live="polite">
      {t('activity.counts', {
        inGame: activity?.inGamePlayers ?? '—',
        queued: activity?.queuedPlayers ?? '—',
        region: activity?.region.toUpperCase() ?? '—'
      })}
    </span>
  )
}
