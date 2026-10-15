import { useId, type JSX, type SelectHTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string }

export function SelectField({
  label,
  className,
  id,
  children,
  ...props
}: SelectFieldProps): JSX.Element {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label htmlFor={inputId} className="grid gap-2 text-sm font-semibold text-neutral-200">
      {label}
      <select
        id={inputId}
        className={twMerge(
          'h-11 w-full rounded-none border border-white/20 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-400/40 disabled:cursor-wait disabled:opacity-60',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  )
}
