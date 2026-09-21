import type { ButtonHTMLAttributes, JSX } from 'react'
import { twMerge } from 'tailwind-merge'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

const variants = {
  primary:
    'bg-amber-400 text-neutral-950 hover:bg-amber-300 focus-visible:outline-amber-300 disabled:bg-amber-400/50',
  // An action that needs a visible surface but is not the highlighted one, such as
  // buying a skin with earned Points instead of premium Papa Cash.
  secondary:
    'border border-white/15 bg-white/10 text-white hover:bg-white/15 focus-visible:outline-neutral-300 disabled:bg-white/5 disabled:text-neutral-500',
  ghost:
    'bg-transparent text-neutral-400 hover:bg-white/5 hover:text-white focus-visible:outline-neutral-400'
} as const

export function Button({
  className,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={twMerge(
        'inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
