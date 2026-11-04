import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { CurrencyIcon, type CurrencyKind } from './CurrencyIcon'

const currencies: CurrencyKind[] = ['P_CASH', 'POINTS']

export function CurrencySelect({
  value,
  onChange,
  label,
  labels,
  disabled = false,
  className
}: {
  value: CurrencyKind
  onChange: (currency: CurrencyKind) => void
  label: string
  labels: Record<CurrencyKind, string>
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(value)
  const expanded = open && !disabled

  useEffect(() => {
    if (!expanded) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [expanded])

  const choose = (currency: CurrencyKind) => {
    setOpen(false)
    if (currency !== value) onChange(currency)
  }

  return (
    <div ref={root} className={twMerge('relative w-40 shrink-0', className)}>
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-controls={`${id}-options`}
        aria-activedescendant={expanded ? `${id}-${active}` : undefined}
        disabled={disabled}
        className="flex h-10 w-full items-center gap-2 rounded-none border border-white/20 bg-neutral-950 px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50"
        onBlur={() => setOpen(false)}
        onClick={() => {
          setActive(value)
          setOpen(!expanded)
        }}
        onKeyDown={(event) => {
          const key = event.key
          if (key === 'Tab' || key === 'Escape') {
            setOpen(false)
            if (key === 'Escape' && expanded) {
              event.preventDefault()
              event.stopPropagation()
            }
          } else if (key === 'Enter' || key === ' ') {
            event.preventDefault()
            if (expanded) choose(active)
            else {
              setActive(value)
              setOpen(true)
            }
          } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
            event.preventDefault()
            setOpen(true)
            setActive(
              key === 'Home'
                ? 'P_CASH'
                : key === 'End'
                  ? 'POINTS'
                  : !expanded
                    ? value
                    : currencies[(currencies.indexOf(active) + 1) % 2]
            )
          } else {
            const match = currencies.find((currency) =>
              labels[currency].toLocaleLowerCase().startsWith(key.toLocaleLowerCase())
            )
            if (key.length === 1 && match) {
              event.preventDefault()
              setActive(match)
              setOpen(true)
            }
          }
        }}
      >
        <span aria-hidden="true">
          <CurrencyIcon currency={value} className="size-5" />
        </span>
        <span className="flex-1 text-left">{labels[value]}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
      </button>
      {expanded && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-1 w-full border border-white/20 bg-neutral-950 p-1 text-sm text-white shadow-lg"
        >
          {currencies.map((currency) => (
            <li
              key={currency}
              id={`${id}-${currency}`}
              role="option"
              aria-selected={value === currency}
              className={twMerge(
                'flex h-10 cursor-pointer items-center gap-2 px-2',
                active === currency && 'bg-white/15'
              )}
              onPointerMove={() => setActive(currency)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(currency)}
            >
              <span aria-hidden="true">
                <CurrencyIcon currency={currency} className="size-5" />
              </span>
              <span className="flex-1">{labels[currency]}</span>
              <Check
                className={twMerge('size-4', value !== currency && 'invisible')}
                aria-hidden="true"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
