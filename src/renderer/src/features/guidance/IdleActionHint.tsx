import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'

const IDLE_DELAY_MS = 25_000

interface IdleActionHintProps {
  targetId: string | null
}

/** A reusable, non-interactive pointer to an action after the player goes idle. */
export function IdleActionHint({ targetId }: IdleActionHintProps): JSX.Element | null {
  if (!targetId) return null
  return <ActiveIdleActionHint key={targetId} targetId={targetId} />
}

function ActiveIdleActionHint({ targetId }: { targetId: string }): JSX.Element | null {
  const [idle, setIdle] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number; pointsUp: boolean } | null>(null)

  useEffect(() => {
    let timer =
      document.hidden || !document.hasFocus()
        ? 0
        : window.setTimeout(() => setIdle(true), IDLE_DELAY_MS)
    const reset = (): void => {
      setIdle(false)
      window.clearTimeout(timer)
      if (!document.hidden && document.hasFocus()) {
        timer = window.setTimeout(() => setIdle(true), IDLE_DELAY_MS)
      }
    }
    window.addEventListener('pointermove', reset)
    window.addEventListener('pointerdown', reset)
    window.addEventListener('keydown', reset)
    window.addEventListener('focus', reset)
    document.addEventListener('visibilitychange', reset)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', reset)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
      window.removeEventListener('focus', reset)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [targetId])

  useEffect(() => {
    if (!idle || !targetId) return
    const updatePosition = (): void => {
      const target = document.querySelector<HTMLElement>(`[data-idle-hint-target="${targetId}"]`)
      if (
        !target ||
        target.matches(':disabled') ||
        document.hidden ||
        !document.hasFocus() ||
        document.querySelector('[role="dialog"]')
      ) {
        setPosition(null)
        return
      }
      const rect = target.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        setPosition(null)
        return
      }
      const pointsUp = rect.top < window.innerHeight / 2
      setPosition({
        x: Math.max(20, Math.min(window.innerWidth - 20, rect.left + rect.width / 2)),
        y: pointsUp ? rect.bottom + 10 : rect.top - 10,
        pointsUp
      })
    }
    updatePosition()
    const interval = window.setInterval(updatePosition, 500)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('resize', updatePosition)
    }
  }, [idle, targetId])

  if (!idle || !position) return null

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-50 flex -translate-x-1/2 flex-col items-center text-sky-200 drop-shadow-[0_2px_5px_black]"
      style={{
        left: position.x,
        top: position.y,
        transform: `translate(-50%, ${position.pointsUp ? '0' : '-100%'})`
      }}
    >
      {position.pointsUp && (
        <ArrowUp className="size-7 motion-safe:animate-bounce" strokeWidth={3} />
      )}
      {!position.pointsUp && (
        <ArrowDown className="size-7 motion-safe:animate-bounce" strokeWidth={3} />
      )}
    </div>,
    document.body
  )
}
