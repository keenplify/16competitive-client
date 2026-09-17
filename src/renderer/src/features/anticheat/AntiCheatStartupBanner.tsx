import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

const BANNER_IMAGE_PATH = '/anticheat-banner.png'
const FADE_AT_MS = 1_800
const HIDE_AT_MS = 2_250

export function AntiCheatStartupBanner(): React.JSX.Element | null {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)
  const [imageAvailable, setImageAvailable] = useState(true)

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setFading(true), FADE_AT_MS)
    const hideTimer = window.setTimeout(() => setVisible(false), HIDE_AT_MS)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`pointer-events-none fixed right-5 bottom-5 z-[10000] w-[min(360px,calc(100vw-2.5rem))] transition-all duration-500 ${
        fading ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="flex items-center gap-4 rounded-lg border border-white/15 bg-neutral-950/95 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/5">
          {imageAvailable ? (
            <img
              src={BANNER_IMAGE_PATH}
              alt=""
              className="h-full w-full object-contain p-1"
              onError={() => setImageAvailable(false)}
            />
          ) : (
            <ShieldCheck className="h-8 w-8 text-white" strokeWidth={1.5} />
          )}
        </div>

        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-[0.08em] text-white uppercase">
            1.6 Competitive Anti-Cheat
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Integrity checks active
          </div>
        </div>
      </div>
    </div>
  )
}
