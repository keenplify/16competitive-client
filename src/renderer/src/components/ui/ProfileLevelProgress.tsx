import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { ProfileXpAward } from '../../../../shared/profile-level'
import { profileRankProgress } from '../../../../shared/profile-ranks'
import { ProfileRankInsignia } from './ProfileRankInsignia'

const ANIMATION_MS = 2600

interface ProfileLevelProgressProps {
  award: ProfileXpAward
  className?: string
}

export function ProfileLevelProgress({ award, className }: ProfileLevelProgressProps): JSX.Element {
  const [displayedXp, setDisplayedXp] = useState(award.xpBefore)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || award.xpEarned === 0) {
      const frameId = window.requestAnimationFrame(() => setDisplayedXp(award.xpAfter))
      return () => window.cancelAnimationFrame(frameId)
    }

    let elapsed = 0
    let lastFrame = 0
    let frameId = 0
    const visible = (): boolean => !document.hidden && document.hasFocus()
    const frame = (now: number): void => {
      frameId = 0
      if (!visible()) {
        lastFrame = 0
        return
      }
      if (lastFrame) elapsed += now - lastFrame
      lastFrame = now
      const fraction = Math.min(1, elapsed / ANIMATION_MS)
      const eased = 1 - (1 - fraction) ** 3
      setDisplayedXp(Math.min(award.xpAfter, Math.floor(award.xpBefore + award.xpEarned * eased)))
      if (fraction < 1) frameId = window.requestAnimationFrame(frame)
    }
    const resume = (): void => {
      if (visible() && !frameId && elapsed < ANIMATION_MS) {
        frameId = window.requestAnimationFrame(frame)
      }
    }
    const pause = (): void => {
      if (frameId) window.cancelAnimationFrame(frameId)
      frameId = 0
      lastFrame = 0
    }
    const onVisibilityChange = (): void => {
      if (visible()) resume()
      else pause()
    }
    resume()
    window.addEventListener('focus', onVisibilityChange)
    window.addEventListener('blur', onVisibilityChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      pause()
      window.removeEventListener('focus', onVisibilityChange)
      window.removeEventListener('blur', onVisibilityChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [award])

  const current = profileRankProgress(displayedXp)
  const percent = Math.min(100, (current.xpIntoLevel / current.xpForNextLevel) * 100)
  const leveledUp = current.level > award.levelBefore

  return (
    <section
      className={twMerge('border border-sky-300/20 bg-slate-950/70 p-5', className)}
      aria-label="Account level progress"
    >
      <div className="flex items-center gap-4">
        <ProfileRankInsignia level={current.level} title={current.title} className="size-14" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.2em] text-sky-300 uppercase">Account level</p>
          <p className="text-lg font-bold text-white">
            Level {current.level} · {current.title}
          </p>
        </div>
        <span className="text-xl font-black text-amber-300">
          +{award.xpEarned.toLocaleString()} XP
        </span>
      </div>
      <div
        className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="Level XP"
        aria-valuenow={current.xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={current.xpForNextLevel}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-300 to-amber-300 shadow-[0_0_14px_rgba(125,211,252,0.6)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-white/55">
        <span>
          {current.xpIntoLevel.toLocaleString()} / {current.xpForNextLevel.toLocaleString()} XP
        </span>
        <span>
          {leveledUp
            ? 'LEVEL UP!'
            : current.level === 40
              ? 'MAX LEVEL'
              : `Level ${current.level + 1}`}
        </span>
      </div>
    </section>
  )
}
