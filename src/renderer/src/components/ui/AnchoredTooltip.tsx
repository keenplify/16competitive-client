import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'

/** Escape window/scroll clipping and keep the measured tooltip inside the viewport. */
export function AnchoredTooltip({
  id,
  anchorRef,
  children,
  className
}: {
  id: string
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
  className?: string
}): ReactNode {
  const ref = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const tooltip = ref.current
    if (!anchor || !tooltip) return
    const update = (): void => {
      const rect = anchor.getBoundingClientRect()
      const { width, height } = tooltip.getBoundingClientRect()
      const above = rect.top - height - 8
      const top = above >= 16 ? above : rect.bottom + 8
      setPosition({
        left: Math.max(
          16,
          Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 16)
        ),
        top: Math.max(16, Math.min(top, window.innerHeight - height - 16))
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(tooltip)
    observer.observe(anchor)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef])

  return createPortal(
    <span
      ref={ref}
      id={id}
      role="tooltip"
      className={twMerge(
        'pointer-events-none fixed z-[10000] w-max max-w-[min(14rem,calc(100vw-2rem))] rounded-none border border-white/15 bg-neutral-950 px-3 py-2 text-left text-[11px] leading-4 font-normal whitespace-normal text-neutral-200 shadow-xl',
        className
      )}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden'
      }}
    >
      {children}
    </span>,
    document.body
  )
}
