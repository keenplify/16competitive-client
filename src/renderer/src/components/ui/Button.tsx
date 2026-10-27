import type { AnchorHTMLAttributes, ButtonHTMLAttributes, JSX } from 'react'
import { twMerge } from 'tailwind-merge'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant
}

const variants = {
  primary:
    'bg-amber-400 text-neutral-950 hover:bg-amber-300 focus-visible:outline-amber-300 disabled:bg-amber-400/50',
  // An action that needs a visible surface but is not the highlighted one, such as
  // buying a skin with earned Points instead of premium Papa Cash.
  secondary:
    'border border-white/15 bg-white/10 text-white hover:bg-white/15 focus-visible:outline-neutral-300 disabled:bg-white/5 disabled:text-neutral-500',
  tertiary:
    'border border-cyan-300/40 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25 focus-visible:outline-cyan-300 disabled:opacity-40',
  ghost:
    'bg-transparent text-neutral-400 hover:bg-white/5 hover:text-white focus-visible:outline-neutral-400'
} as const

const buttonClassName = (variant: ButtonVariant, className?: string): string =>
  twMerge(
    'inline-flex h-11 items-center justify-center px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
    variants[variant],
    className
  )

export function Button({
  className,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={buttonClassName(variant, className)}
      {...props}
    />
  )
}

export function ButtonLink({
  className,
  variant = 'primary',
  ...props
}: ButtonLinkProps): JSX.Element {
  return <a data-ui-button className={buttonClassName(variant, className)} {...props} />
}
