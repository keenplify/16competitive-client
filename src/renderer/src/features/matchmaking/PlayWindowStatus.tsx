import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { NodePlayWindow } from '../../../../shared/play-window'
import { isPlayWindowActive } from '../../../../shared/play-window'
import { HelpTooltip } from '../../components/ui/HelpTooltip'
import { useTranslation } from '../i18n/i18n'

interface PlayWindowStatusProps {
  playWindow: NodePlayWindow | null | undefined
  visible: boolean
  className?: string
}

export function PlayWindowStatus({
  playWindow,
  visible,
  className
}: PlayWindowStatusProps): JSX.Element {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!visible) return
    const timer = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [visible])

  const active = playWindow ? isPlayWindowActive(playWindow, now) : null
  const status =
    active !== null
      ? active
        ? t('matchmaking.playWindowActive')
        : t('matchmaking.playWindowInactive')
      : t('matchmaking.playWindowUnavailable')
  const schedule =
    playWindow && active !== null
      ? t('matchmaking.playWindow', {
          points: playWindow.bonusPoints,
          start: playWindow.startsAt,
          end: playWindow.endsAt,
          timeZone: playWindow.timeZone
        })
      : ''
  const tooltip = t('matchmaking.playWindowTooltip')

  return (
    <div
      className={twMerge('mt-1 h-10 text-xs', !visible && 'invisible', className)}
      aria-hidden={!visible}
    >
      <div
        className={twMerge(
          'flex h-5 items-center gap-1.5 font-semibold',
          active && playWindow ? 'text-emerald-300' : 'text-neutral-400'
        )}
        aria-live="polite"
      >
        <span
          className={twMerge(
            'size-1.5 shrink-0 rounded-full',
            active && playWindow ? 'bg-emerald-400' : 'bg-neutral-500'
          )}
          aria-hidden="true"
        />
        <span className="truncate">{status}</span>
        <HelpTooltip text={tooltip} />
      </div>
      <p className="h-5 truncate text-emerald-300" title={schedule}>
        {schedule}
      </p>
    </div>
  )
}
