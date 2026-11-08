import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { useTranslation } from '../i18n/i18n'

export function RankedWarmupNotice({
  phase,
  ratingMultiplier,
  className
}: {
  phase?: 'WARMUP' | 'STARTING' | 'LIVE'
  ratingMultiplier?: 0.5 | 1
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <p role="status" className={twMerge('h-10 text-sm leading-5 text-neutral-400', className)}>
      {phase === 'WARMUP'
        ? t('rankedWarmup.earlyHint')
        : ratingMultiplier === 0.5
          ? t('rankedWarmup.botMmr')
          : ''}
    </p>
  )
}
