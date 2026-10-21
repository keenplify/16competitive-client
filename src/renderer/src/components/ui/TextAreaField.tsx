import { useId, type JSX, type TextareaHTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
}

export function TextAreaField({
  label,
  hint,
  className,
  id,
  ...props
}: TextAreaFieldProps): JSX.Element {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <label className="grid gap-2" htmlFor={fieldId}>
      <span className="text-sm font-medium text-neutral-200">{label}</span>
      <textarea
        id={fieldId}
        aria-describedby={hint ? `${fieldId}-hint` : undefined}
        className={twMerge(
          'w-full resize-none rounded-none border border-white/10 bg-neutral-950/70 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-400 focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/10',
          className
        )}
        {...props}
      />
      {hint && (
        <span id={`${fieldId}-hint`} className="text-xs text-neutral-400">
          {hint}
        </span>
      )}
    </label>
  )
}
