import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { useMatchmakingStore } from './matchmaking.store'
import { useTranslation } from '../i18n/i18n'

export function PlayerActivity({ className }: { className?: string }): JSX.Element {
  const activity = useMatchmakingStore((state) => state.activity)
  const selectedNodeId = useMatchmakingStore((state) => state.selectedNodeId)
  const allowRegionExpansion = useMatchmakingStore((state) => state.allowRegionExpansion)
  const nearby = !selectedNodeId || allowRegionExpansion
  const { t } = useTranslation()
  return (
    <span
      className={twMerge('inline-block min-w-72 tabular-nums', className)}
      aria-live="polite"
      title={activity?.regions?.map((region) => region.toUpperCase()).join(', ')}
    >
      {t(nearby ? 'activity.nearbyCounts' : 'activity.counts', {
        inGame: activity?.inGamePlayers ?? '—',
        queued: activity?.queuedPlayers ?? '—',
        region:
          (activity?.regions ?? (activity ? [activity.region] : []))
            .map((region) => region.toUpperCase())
            .join(', ') || '—'
      })}
    </span>
  )
}
