import type { ReactNode, JSX } from 'react'
import { twMerge } from 'tailwind-merge'

export interface TabListItem<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  disabled?: boolean
  title?: string
}

interface TabListProps<T extends string> {
  value: T
  items: readonly TabListItem<T>[]
  ariaLabel: string
  onChange: (value: T) => void
  className?: string
}

export function TabList<T extends string>({
  value,
  items,
  ariaLabel,
  onChange,
  className
}: TabListProps<T>): JSX.Element {
  return (
    <div
      className={twMerge('flex gap-1 overflow-x-auto border-b border-white/15 pb-1', className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const selected = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={item.disabled}
            title={item.title}
            className={twMerge(
              'flex h-9 min-w-24 shrink-0 items-center justify-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-xs font-bold tracking-wide text-neutral-300 uppercase transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5',
              selected && 'border-sky-300 bg-sky-300/10 text-sky-200 hover:bg-sky-300/10 hover:text-sky-200'
            )}
            onClick={() => onChange(item.value)}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
