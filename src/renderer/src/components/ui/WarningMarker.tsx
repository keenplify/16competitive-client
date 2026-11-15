import { twMerge } from 'tailwind-merge'
import { AnchoredTooltip } from './AnchoredTooltip'
import { useId, useRef, useState, type JSX, type ReactNode } from 'react'

/**
 * A red circular warning marker with a hover/focus explanation. Reusable for
 * any per-player incompatibility: short bet balance, missing game version,
 * unverified assets, and similar lobby warnings.
 */
export function WarningMarker({
  label,
  children,
  className
}: {
  /** Accessible name for the marker itself. */
  label: string
  /** Tooltip content explaining the incompatibility. */
  children: ReactNode
  className?: string
}): JSX.Element {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const visible = hovered || focused
  return (
    <span
      ref={anchorRef}
      role="img"
      aria-label={label}
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setHovered(false)
          setFocused(false)
        }
      }}
      className={twMerge(
        'relative grid size-4 shrink-0 cursor-help place-items-center rounded-full border border-red-400 bg-red-400/15 outline-none focus-visible:border-red-200',
        className
      )}
      aria-describedby={visible ? tooltipId : undefined}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-red-400" />
      {visible && (
        <AnchoredTooltip id={tooltipId} anchorRef={anchorRef}>
          {children}
        </AnchoredTooltip>
      )}
    </span>
  )
}
