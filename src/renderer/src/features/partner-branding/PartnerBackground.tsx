import { useLauncherThemeStore } from '../settings/launcher-theme.store'
import { useEffect, useRef, useState, type JSX } from 'react'
import { usePartnerBrandingStore } from './partner-branding.store'
import { twMerge } from 'tailwind-merge'

export function PartnerBackground({
  className,
  surface = 'launcher'
}: {
  className?: string
  surface?: 'launcher' | 'login'
}): JSX.Element | null {
  const theme = useLauncherThemeStore((state) => state.theme)
  const hasPreference = useLauncherThemeStore((state) => state.hasPreference)
  const communityTheme = !hasPreference || theme === 'community'
  const branding = usePartnerBrandingStore((state) => (state.enabled ? state.branding : null))
  const url = surface === 'login' ? branding?.loginBackgroundUrl : branding?.backgroundUrl
  const kind = surface === 'login' ? branding?.loginBackgroundKind : branding?.backgroundKind
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
  }, [url, reduceMotion])

  if (!url || !communityTheme) return null
  if (kind === 'video') {
    if (reduceMotion) return null
    return (
      <video
        ref={videoRef}
        key={url}
        className={twMerge(
          'pointer-events-none fixed inset-0 h-full w-full object-cover',
          className
        )}
        src={url}
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
      key={url}
      className={twMerge('pointer-events-none fixed inset-0 h-full w-full object-cover', className)}
      src={url}
      alt=""
      decoding="async"
      onError={(event) => {
        event.currentTarget.hidden = true
      }}
    />
  )
}
