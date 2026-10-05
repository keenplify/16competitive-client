import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { twMerge } from 'tailwind-merge'

interface ChoiceCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string
  description: string
  icon: ReactNode
  selected: boolean
  badge?: string
}

export function ChoiceCard({
  title,
  description,
  icon,
  selected,
  badge,
  className,
  ...props
}: ChoiceCardProps): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={twMerge(
        'group flex w-full items-start gap-4 border border-white/10 bg-white/3 p-4 text-left transition-[background-color,border-color,transform] duration-200 hover:border-sky-400/40 hover:bg-sky-400/5 motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400',
        selected && 'border-sky-400/70 bg-sky-400/10',
        className
      )}
      {...props}
    >
      <span
        className={twMerge(
          'grid size-10 shrink-0 place-items-center bg-white/8 text-neutral-300',
          selected && 'bg-sky-400/15 text-sky-300'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{title}</span>
          {badge && (
            <span className="bg-sky-400/12 px-2 py-0.5 text-[10px] font-bold tracking-wide text-sky-300 uppercase">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-xs leading-5 text-neutral-400">{description}</span>
      </span>
      <span
        className={twMerge(
          'grid size-5 shrink-0 place-items-center border border-white/20 text-transparent',
          selected && 'border-sky-400 bg-sky-400 text-slate-950'
        )}
        aria-hidden="true"
      >
        <Check className="size-3.5" />
      </span>
    </button>
  )
}
