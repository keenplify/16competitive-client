import type { JSX } from 'react'
import { CircleHelp, LoaderCircle, TicketSlash } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { HelpTooltip } from '../../components/ui/HelpTooltip'

export function RefundAction({
  label,
  reason,
  pending,
  disabled,
  onClick,
  className
}: {
  label: string
  reason: string | null
  pending: boolean
  disabled: boolean
  onClick: () => void
  className?: string
}): JSX.Element {
  const button = (
    <Button
      className={twMerge('h-8 px-3 text-xs', reason && 'pointer-events-none')}
      variant="ghost"
      disabled={disabled || Boolean(reason)}
      onClick={onClick}
    >
      {pending ? (
        <LoaderCircle className="mr-1 size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <TicketSlash className="mr-1 size-3.5" aria-hidden="true" />
      )}
      {label}
      <CircleHelp className={twMerge('ml-1 size-3.5', !reason && 'invisible')} aria-hidden="true" />
    </Button>
  )
  return (
    <span className={twMerge('inline-flex items-center', className)}>
      {reason ? <HelpTooltip text={reason}>{button}</HelpTooltip> : button}
    </span>
  )
}
