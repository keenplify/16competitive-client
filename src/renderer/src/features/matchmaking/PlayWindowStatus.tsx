import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Clock3 } from 'lucide-react'
import type { NodePlayWindow } from '../../../../shared/play-window'
import { isPlayWindowActive } from '../../../../shared/play-window'
import { serverClockNow } from '../../../../shared/server-clock'
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
  const [now, setNow] = useState(() => new Date(serverClockNow()))

  useEffect(() => {
    if (!visible) return
    const timer = window.setInterval(() => setNow(new Date(serverClockNow())), 15_000)
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
      className={twMerge('min-h-12 text-xs', !visible && 'invisible', className)}
      aria-hidden={!visible}
    >
      <div
        className={twMerge(
          'flex min-h-5 items-center gap-1.5 font-semibold',
          active && playWindow ? 'text-emerald-300' : 'text-neutral-400'
        )}
        aria-live="polite"
      >
        <Clock3 className="size-4 shrink-0" aria-hidden="true" />
        <span className="shrink-0">{t('matchmaking.peakHours')}</span>
        <span aria-hidden="true">·</span>
        <span>{status}</span>
        <HelpTooltip text={tooltip} />
      </div>
      <p className="min-h-5 break-words text-emerald-300" title={schedule}>
        {schedule}
      </p>
    </div>
  )
}
