import { useEffect, useRef, useState, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useOperationStore } from './operation.store'

const REVEAL_DELAY_MS = 1_400
const REVEAL_DURATION_MS = 2_000

export function OperationMatchProgress(): JSX.Element | null {
  const snapshot = useOperationStore((state) => state.snapshot)
  const status = useOperationStore((state) => state.mineStatus)
  const error = useOperationStore((state) => state.error)
  const loadMine = useOperationStore((state) => state.loadMine)
  const acknowledge = useOperationStore((state) => state.acknowledge)
  const [displayedPoints, setDisplayedPoints] = useState<number | null>(null)
  const acknowledgedRef = useRef<string | null>(null)

  useEffect(() => {
    void loadMine()
  }, [loadMine])

  const operation = status === 'ready' ? snapshot?.operation : null
  const progress = status === 'ready' ? snapshot?.progress : null
  const target = progress?.points ?? 0
  const start = progress ? Math.min(progress.lastViewedPoints, target) : 0

  useEffect(() => {
    if (!operation || !progress) return

    const key = `${operation.id}:${target}`
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let delay = REVEAL_DELAY_MS
    let delayStartedAt = 0
    let elapsed = 0
    let previousFrame = 0
    let timer = 0
    let frameId = 0

    const visible = (): boolean => !document.hidden && document.hasFocus()
    const acknowledgeOnce = (): void => {
      if (target <= start || acknowledgedRef.current === key) return
      acknowledgedRef.current = key
      void acknowledge(operation.id, target)
    }
    const frame = (now: number): void => {
      if (!visible()) {
        frameId = 0
        previousFrame = 0
        return
      }
      if (previousFrame) elapsed += now - previousFrame
      previousFrame = now
      const fraction = Math.min(1, elapsed / REVEAL_DURATION_MS)
      const eased = 1 - Math.pow(1 - fraction, 3)
      setDisplayedPoints(Math.round(start + (target - start) * eased))
      if (fraction < 1) frameId = window.requestAnimationFrame(frame)
      else {
        frameId = 0
        acknowledgeOnce()
      }
    }
    const resume = (): void => {
      if (!visible() || timer || frameId) return
      if (target <= start || reducedMotion) {
        frameId = window.requestAnimationFrame(() => {
          frameId = 0
          setDisplayedPoints(target)
          acknowledgeOnce()
        })
        return
      }
      if (delay > 0) {
        delayStartedAt = Date.now()
        timer = window.setTimeout(() => {
          timer = 0
          delay = 0
          frameId = window.requestAnimationFrame(frame)
        }, delay)
      } else frameId = window.requestAnimationFrame(frame)
    }
    const onVisibilityChange = (): void => {
      if (visible()) {
        resume()
        return
      }
      if (timer) {
        window.clearTimeout(timer)
        timer = 0
        delay = Math.max(0, delay - (Date.now() - delayStartedAt))
      }
      if (frameId) {
        window.cancelAnimationFrame(frameId)
        frameId = 0
        previousFrame = 0
      }
    }

    onVisibilityChange()
    window.addEventListener('focus', onVisibilityChange)
    window.addEventListener('blur', onVisibilityChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('focus', onVisibilityChange)
      window.removeEventListener('blur', onVisibilityChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [acknowledge, operation, progress, start, target])

  if (status === 'idle' || status === 'loading') {
    return (
      <section className="mt-4 border border-sky-300/15 bg-[#080d19]/90 p-5 text-left text-sm text-white/50">
        Loading Operation progress…
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="mt-4 border border-white/10 bg-neutral-950/90 p-5 text-left">
        <p className="text-sm text-rose-300">{error ?? 'Could not load Operation progress.'}</p>
        <Button className="mt-3" variant="ghost" onClick={() => void loadMine()}>
          Retry Operation progress
        </Button>
      </section>
    )
  }

  if (!operation || !progress) return null

  const shown = displayedPoints ?? start
  const maxPoints = Math.max(1, target, ...operation.tiers.map((tier) => tier.requiredPoints))
  const nextTier = operation.tiers.find((tier) => tier.requiredPoints > shown)
  const gained = Math.max(0, target - start)

  return (
    <section className="mt-4 border border-sky-300/15 bg-[#080d19]/90 p-5 text-left shadow-[0_20px_70px_rgba(0,0,0,0.38)] sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-sky-300 uppercase">
            Operation progress
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">{operation.title}</h2>
        </div>
        <div className="text-right" aria-live="off">
          <p className="font-mono text-2xl font-black tabular-nums text-white">
            {shown.toLocaleString()} <span className="text-sm text-sky-300">OP</span>
          </p>
          {gained > 0 && (
            <p className="text-xs font-semibold text-cyan-300">
              +{gained.toLocaleString()} OP since last view
            </p>
          )}
        </div>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="Operation reward progress"
        aria-valuenow={shown}
        aria-valuemin={0}
        aria-valuemax={maxPoints}
      >
        <div
          className="h-full bg-linear-to-r from-cyan-400 via-sky-300 to-blue-500"
          style={{ width: `${Math.min(100, (shown / maxPoints) * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-white/50">
        {nextTier
          ? `${Math.max(0, nextTier.requiredPoints - shown).toLocaleString()} OP to Tier ${nextTier.tier}`
          : 'Operation track complete'}
      </p>
    </section>
  )
}
