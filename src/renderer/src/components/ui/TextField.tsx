import type { InputHTMLAttributes, JSX, ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  leadingIcon?: ReactNode
}

export function TextField({
  className,
  hint,
  id,
  label,
  leadingIcon,
  ...props
}: TextFieldProps): JSX.Element {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="text-sm font-medium text-neutral-200">{label}</span>
      <div className="relative">
        {leadingIcon && (
          <span
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-500"
            aria-hidden="true"
          >
            {leadingIcon}
          </span>
        )}
        <input
          id={id}
          className={twMerge(
            'h-11 w-full rounded-md border border-white/10 bg-neutral-950/70 px-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/10',
            className
          )}
          {...props}
        />
      </div>
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}
