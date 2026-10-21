import type { JSX } from 'react'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useTranslation } from '../i18n/i18n'
import { MatchResultsPage } from './MatchResultsPage'
import { useQueueWarmupStore } from './queue-warmup.store'

/** Reuse the normal result view without replacing the active ranked queue state. */
export function QueueWarmupResults(): JSX.Element | null {
  const { t } = useTranslation()
  const match = useQueueWarmupStore((state) => state.completedMatch)
  const dismiss = useQueueWarmupStore((state) => state.dismissCompletedMatch)
  if (!match) return null
  return (
    <ModalDialog
      open
      onClose={dismiss}
      fullScreen
      label={t('warmup.tab')}
      className="overflow-y-auto"
    >
      <MatchResultsPage key={match.matchId} match={match} />
    </ModalDialog>
  )
}
