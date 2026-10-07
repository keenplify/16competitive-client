import { useId, useLayoutEffect, useRef, useState, type JSX } from 'react'
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
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<{
    left: number
    top: number
    anchorTop: number
    anchorBottom: number
    ready: boolean
  } | null>(null)
  useLayoutEffect(() => {
    if (!position || position.ready || !tooltipRef.current) return
    const height = tooltipRef.current.getBoundingClientRect().height
    const spaceAbove = position.anchorTop - 24
    const spaceBelow = window.innerHeight - position.anchorBottom - 24
    const above =
      placement === 'top'
        ? spaceAbove >= height || spaceAbove > spaceBelow
        : spaceBelow < height && spaceAbove > spaceBelow
    const desiredTop = above ? position.anchorTop - height - 8 : position.anchorBottom + 8
    setPosition({
      ...position,
      top: Math.max(16, Math.min(desiredTop, window.innerHeight - height - 16)),
      ready: true
    })
  }, [placement, position])
  const show = (element: HTMLButtonElement): void => {
    const rect = element.getBoundingClientRect()
    const width = Math.min(288, window.innerWidth - 32)
    setPosition({
      left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
      top: 0,
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
      ready: false
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
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[100] max-h-[calc(100vh-2rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto border border-white/15 bg-neutral-950 px-3 py-2 text-left text-xs leading-relaxed font-normal whitespace-normal text-white shadow-xl"
            style={{
              left: position.left,
              top: position.top,
              visibility: position.ready ? 'visible' : 'hidden'
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  )
}
