import { useId, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'
import { twMerge } from 'tailwind-merge'

interface HelpTooltipProps {
  text: string
  className?: string
  placement?: 'top' | 'bottom'
}

/** A focusable question mark that reveals help on hover or keyboard focus. */
export function HelpTooltip({
  text,
  className,
  placement = 'bottom'
}: HelpTooltipProps): JSX.Element {
  const tooltipId = useId()
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(
    null
  )
  const show = (element: HTMLButtonElement): void => {
    const rect = element.getBoundingClientRect()
    const width = Math.min(288, window.innerWidth - 32)
    const estimatedHeight = Math.ceil(text.length / 42) * 17 + 24
    const above = placement === 'top' && rect.top > estimatedHeight + 8
    setPosition({
      left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
      top: above ? rect.top - 8 : rect.bottom + 8,
      above
    })
  }
  return (
    <span className={twMerge('inline-flex shrink-0', className)}>
      <button
        type="button"
        className="inline-flex size-5 items-center justify-center text-current/70 hover:text-current focus-visible:rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        aria-label={text}
        aria-describedby={position ? tooltipId : undefined}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={() => setPosition(null)}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={() => setPosition(null)}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </button>
      {position &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[100] w-72 max-w-[calc(100vw-2rem)] border border-white/15 bg-neutral-950 px-3 py-2 text-left text-xs leading-relaxed font-normal whitespace-normal text-white shadow-xl"
            style={{
              left: position.left,
              top: position.top,
              transform: position.above ? 'translateY(-100%)' : undefined
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  )
}
