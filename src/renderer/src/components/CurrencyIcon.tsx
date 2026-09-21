import { twMerge } from 'tailwind-merge'
import type { JSX } from 'react'
import pointsCoin from '../assets/points-coin.webp'
import papaCashCoin from '../assets/papa-cash-coin.webp'

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
  showTooltip = true,
  animated = false
}: {
  currency: CurrencyKind
  amount: number
  className?: string
  iconClassName?: string
  showTooltip?: boolean
  animated?: boolean
}): JSX.Element {
  const presentation = currencyPresentation[currency]

  return (
    <span
      className={twMerge(
        'group/currency relative inline-flex items-center gap-1.5 tabular-nums',
        className
      )}
      aria-label={`${amount.toLocaleString()} ${presentation.label}`}
    >
      <CurrencyIcon
        currency={currency}
        animated={animated}
        className={twMerge('size-5', iconClassName)}
      />
      <span>{amount.toLocaleString()}</span>
      {showTooltip && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-max max-w-56 -translate-x-1/2 translate-y-1 rounded border border-white/15 bg-neutral-950/95 px-3 py-2 text-left text-[11px] font-normal leading-4 text-neutral-200 opacity-0 shadow-2xl backdrop-blur transition group-hover/currency:translate-y-0 group-hover/currency:opacity-100 group-focus-within/currency:translate-y-0 group-focus-within/currency:opacity-100"
        >
          <strong className="block font-semibold text-white">{presentation.label}</strong>
          <span className="text-neutral-400">{presentation.description}</span>
        </span>
      )}
    </span>
  )
}
