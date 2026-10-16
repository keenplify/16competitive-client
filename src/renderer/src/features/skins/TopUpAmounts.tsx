import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { CurrencyIcon } from '../../components/CurrencyIcon'
export function TopUpAmountTile({
  amount,
  price,
  selected,
  label,
  onSelect,
  disabled,
  className
}: {
  amount: string
  price: string
  selected: boolean
  label: string
  onSelect: () => void
  disabled?: boolean
  className?: string
}): JSX.Element {
  return (
    <Button
      variant="secondary"
      className={twMerge(
        'h-28 flex-col gap-2 rounded-none px-3 py-4 tabular-nums',
        selected && 'border-amber-300 bg-amber-300 text-neutral-950 hover:bg-amber-200',
        className
      )}
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
      disabled={disabled}
    >
      <span className="inline-flex items-center justify-center gap-2" aria-hidden="true">
        <span className="text-2xl font-semibold leading-none sm:text-3xl">{amount}</span>
        <CurrencyIcon
          currency="P_CASH"
          className={twMerge('size-6', selected && '[&_img]:brightness-0')}
        />
      </span>
      <span
        className={twMerge(
          'text-sm font-medium sm:text-base',
          selected ? 'text-neutral-950' : 'text-amber-200'
        )}
        aria-hidden="true"
      >
        {price}
      </span>
    </Button>
  )
}
