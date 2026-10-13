import { useEffect, useRef, useState, type JSX } from 'react'
import { usePartnerBrandingStore } from './partner-branding.store'

export function PartnerLobbyBackground(): JSX.Element | null {
  const branding = usePartnerBrandingStore((state) => (state.enabled ? state.branding : null))
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => setReduceMotion(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const update = (): void => {
      const video = videoRef.current
      if (!video) return
      if (document.hidden) video.pause()
      else void video.play().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', update)
    update()
    return () => document.removeEventListener('visibilitychange', update)
  }, [branding?.backgroundUrl, reduceMotion])

  if (!branding?.backgroundUrl) return null
  if (branding.backgroundKind === 'video') {
    if (reduceMotion) return null
    return (
      <video
        ref={videoRef}
        key={branding.backgroundUrl}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover"
        src={branding.backgroundUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        onError={(event) => {
          event.currentTarget.hidden = true
        }}
      />
    )
  }
  return (
    <img
      key={branding.backgroundUrl}
      className="pointer-events-none fixed inset-0 h-full w-full object-cover"
      src={branding.backgroundUrl}
      alt=""
      decoding="async"
      onError={(event) => {
        event.currentTarget.hidden = true
      }}
    />
  )
}
