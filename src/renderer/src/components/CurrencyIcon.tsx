import { twMerge } from 'tailwind-merge'
import { useId, useRef, useState, type JSX, type ReactNode } from 'react'
import { AnchoredTooltip } from './ui/AnchoredTooltip'
import pointsCoin from '../assets/currency-points.svg'
import papaCashCoin from '../assets/currency-pcash.svg'

export type CurrencyKind = 'POINTS' | 'P_CASH'

const currencyPresentation = {
  POINTS: {
    label: 'Points',
    description: 'Earned by playing. Used for store and Operation rewards.',
    icon: pointsCoin
  },
  P_CASH: {
    label: 'Papa Cash',
    description: 'Premium currency used for special items and future paid Operations.',
    icon: papaCashCoin
  }
} as const

export function CurrencyBalance({
  currency,
  amount,
  action,
  className
}: {
  currency: CurrencyKind
  amount: number
  action?: ReactNode
  className?: string
}): JSX.Element {
  return (
    <div
      className={twMerge(
        'inline-flex h-10 shrink-0 items-center gap-1.5 border px-2.5',
        currency === 'POINTS'
          ? 'border-sky-300/20 bg-sky-300/10'
          : 'border-amber-300/20 bg-amber-300/10',
        action && 'pr-1',
        className
      )}
    >
      <CurrencyAmount
        currency={currency}
        amount={amount}
        className="text-base font-semibold text-white"
        iconClassName="size-5"
      />
      {action}
    </div>
  )
}

export function CurrencyIcon({
  currency,
  className,
  animated = false
}: {
  currency: CurrencyKind
  className?: string
  animated?: boolean
}): JSX.Element {
  const presentation = currencyPresentation[currency]

  return (
    <span
      className={twMerge(
        'relative inline-grid shrink-0 place-items-center',
        animated && 'currency-icon-bling',
        className
      )}
    >
      <img
        src={presentation.icon}
        alt={presentation.label}
        draggable={false}
        decoding="async"
        className="h-full w-full object-contain"
      />
    </span>
  )
}

export function CurrencyAmount({
  currency,
  amount,
  className,
  iconClassName,
  amountClassName,
  locale,
  showTooltip = true,
  animated = false
}: {
  currency: CurrencyKind
  amount: number
  className?: string
  iconClassName?: string
  amountClassName?: string
  locale?: string
  showTooltip?: boolean
  animated?: boolean
}): JSX.Element {
  const presentation = currencyPresentation[currency]

  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const tooltipVisible = showTooltip && (hovered || focused)

  return (
    <span
      ref={anchorRef}
      className={twMerge('relative inline-flex items-center gap-1.5 tabular-nums', className)}
      aria-label={`${amount.toLocaleString(locale)} ${presentation.label}`}
      aria-describedby={tooltipVisible ? tooltipId : undefined}
      tabIndex={showTooltip ? 0 : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setHovered(false)
          setFocused(false)
        }
      }}
    >
      <CurrencyIcon
        currency={currency}
        animated={animated}
        className={twMerge('size-5', iconClassName)}
      />
      <span className={amountClassName}>{amount.toLocaleString(locale)}</span>
      {tooltipVisible && (
        <AnchoredTooltip id={tooltipId} anchorRef={anchorRef}>
          <strong className="block font-semibold text-white">{presentation.label}</strong>
          <span className="text-neutral-400">{presentation.description}</span>
        </AnchoredTooltip>
      )}
    </span>
  )
}
