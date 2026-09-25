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
      className={twMerge('flex gap-6 border-b border-white/10', className)}
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
              '-mb-px flex items-center gap-2 border-b-2 border-transparent px-1 pb-3 text-sm font-semibold text-neutral-300 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40',
              selected && 'border-sky-400 text-sky-300'
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
