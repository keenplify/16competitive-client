import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'

export function PapamoWordmark({
  className,
  hidden = false
}: {
  className?: string
  hidden?: boolean
}): JSX.Element {
  return (
    <div
      className={twMerge(
        'inline-flex w-fit items-baseline gap-0 font-black italic leading-none tracking-[-0.1em] text-white',
        hidden && 'invisible',
        className
      )}
      role="img"
      aria-label={hidden ? undefined : 'Papamo Games'}
      aria-hidden={hidden}
    >
      <span>PAPA</span>
      <span className="text-orange-500">MO</span>
      <span className="ml-2 text-[20px] font-black tracking-[-0.04em] text-white">GAMES</span>
    </div>
  )
}
