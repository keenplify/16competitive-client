import { twMerge } from 'tailwind-merge'
import type { JSX } from 'react'

export type CurrencyKind = 'POINTS' | 'P_CASH'

const currencyPresentation = {
  POINTS: {
    label: 'Points',
    description: 'Earned by playing. Used for store and Operation rewards.'
  },
  P_CASH: {
    label: 'Papa Cash',
    description: 'Premium currency used for special items and future paid Operations.'
  }
} as const

function PointsCoin({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={twMerge('shrink-0 overflow-visible', className)}
    >
      <defs>
        <linearGradient id="points-coin-face" x1="12" y1="8" x2="51" y2="55">
          <stop offset="0" stopColor="#9ee8ff" />
          <stop offset="0.42" stopColor="#2aa7df" />
          <stop offset="1" stopColor="#1265a9" />
        </linearGradient>
        <linearGradient id="points-coin-rim" x1="14" y1="9" x2="49" y2="56">
          <stop offset="0" stopColor="#d8f7ff" />
          <stop offset="0.5" stopColor="#5fc9ef" />
          <stop offset="1" stopColor="#164f8d" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="28" fill="#0b355d" opacity="0.45" />
      <circle cx="32" cy="30" r="27" fill="url(#points-coin-rim)" />
      <circle cx="32" cy="30" r="22.5" fill="url(#points-coin-face)" />
      <circle cx="32" cy="30" r="18.5" fill="none" stroke="#c7f4ff" strokeOpacity="0.35" />
      <path
        d="M25 18h9.2c7 0 11.8 3.7 11.8 10 0 6.6-4.9 10.4-12.2 10.4H31V46h-6V18Zm6 5.3v9.8h2.9c3.8 0 6-1.7 6-5 0-3.1-2.1-4.8-5.8-4.8H31Z"
        fill="#eefcff"
      />
      <ellipse cx="25" cy="18" rx="10" ry="4" fill="#fff" opacity="0.14" transform="rotate(-25 25 18)" />
    </svg>
  )
}

function PapaCashCoin({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={twMerge('shrink-0 overflow-visible', className)}
    >
      <defs>
        <linearGradient id="pcash-coin-face" x1="13" y1="7" x2="50" y2="56">
          <stop offset="0" stopColor="#fff3a4" />
          <stop offset="0.42" stopColor="#e5b33a" />
          <stop offset="1" stopColor="#a36c10" />
        </linearGradient>
        <linearGradient id="pcash-coin-rim" x1="12" y1="8" x2="50" y2="57">
          <stop offset="0" stopColor="#fff7bd" />
          <stop offset="0.5" stopColor="#f1cc58" />
          <stop offset="1" stopColor="#8d5a0e" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="28" fill="#5a3a05" opacity="0.5" />
      <circle cx="32" cy="30" r="27" fill="url(#pcash-coin-rim)" />
      <circle cx="32" cy="30" r="22.5" fill="url(#pcash-coin-face)" />
      <circle cx="32" cy="30" r="18.5" fill="none" stroke="#fff2a1" strokeOpacity="0.38" />

      <path
        d="M18.5 33.5c3.3 0 5.6-1.6 7.4-4.7 1.6 2 3.6 3 6.1 3s4.5-1 6.1-3c1.8 3.1 4.1 4.7 7.4 4.7-1.7 5.8-6 9-10.4 6.6-1.2-.7-2.2-1.8-3.1-3.3-.9 1.5-1.9 2.6-3.1 3.3-4.4 2.4-8.7-.8-10.4-6.6Z"
        fill="#4a2d10"
      />
      <path
        d="M25 18h8.7c7 0 11.3 3.4 11.3 9.1 0 5.8-4.3 9.2-11.3 9.2H31V43h-6V18Zm6 5.1v8h2.5c3.6 0 5.5-1.4 5.5-4 0-2.7-1.9-4-5.4-4H31Z"
        fill="#fff8d6"
        opacity="0.92"
      />
      <ellipse cx="24" cy="17" rx="10" ry="4" fill="#fff" opacity="0.17" transform="rotate(-25 24 17)" />
    </svg>
  )
}

export function CurrencyIcon({
  currency,
  className
}: {
  currency: CurrencyKind
  className?: string
}): JSX.Element {
  return currency === 'POINTS' ? (
    <PointsCoin className={className} />
  ) : (
    <PapaCashCoin className={className} />
  )
}

export function CurrencyAmount({
  currency,
  amount,
  className,
  iconClassName,
  showTooltip = true
}: {
  currency: CurrencyKind
  amount: number
  className?: string
  iconClassName?: string
  showTooltip?: boolean
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
      <CurrencyIcon currency={currency} className={twMerge('size-5', iconClassName)} />
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
