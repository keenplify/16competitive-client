import { useId, type JSX, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

interface CheckboxSettingProps {
  label: string
  description: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export function CheckboxSetting({
  label,
  description,
  checked,
  disabled,
  onChange,
  className
}: CheckboxSettingProps): JSX.Element {
  const descriptionId = useId()
  return (
    <div
      className={twMerge(
        'rounded-none border border-white/10 bg-neutral-900/90 p-5 sm:p-7',
        className
      )}
    >
      <label className="flex cursor-pointer items-center justify-between gap-5">
        <span className="text-lg font-semibold">{label}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={descriptionId}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="size-5 shrink-0 accent-violet-500"
        />
      </label>
      <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-neutral-400">
        {description}
      </p>
    </div>
  )
}
