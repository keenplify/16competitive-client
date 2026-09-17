import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

const BANNER_IMAGE_PATH = './anticheat-banner.png'
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
      className={`pointer-events-none fixed inset-0 z-[10000] flex items-center justify-center bg-black transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}
      aria-hidden="true"
    >
      <div className="flex w-full max-w-4xl flex-col items-center gap-5 px-8 text-center">
        {imageAvailable ? (
          <img
            src={BANNER_IMAGE_PATH}
            alt=""
            className="max-h-[46vh] max-w-full object-contain"
            onError={() => setImageAvailable(false)}
          />
        ) : (
          <ShieldCheck className="h-24 w-24 text-white" strokeWidth={1.35} />
        )}
        <div>
          <div className="text-xl font-semibold uppercase tracking-[0.35em] text-white">
            1.6 Competitive Anti-Cheat
          </div>
          <div className="mt-2 text-sm uppercase tracking-[0.2em] text-white/55">
            Integrity checks active
          </div>
        </div>
      </div>
    </div>
  )
}
