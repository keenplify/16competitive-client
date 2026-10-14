import { useEffect, type JSX } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { usePartnerBrandingStore } from './partner-branding.store'
import { actionColor } from './palette'

const refreshIntervalMs = 30_000

export function PartnerThemeController(): JSX.Element | null {
  const accountId = useAuthStore((state) => state.session?.player.id ?? null)
  const branding = usePartnerBrandingStore((state) => state.branding)
  const enabled = usePartnerBrandingStore((state) => state.enabled)
  const refresh = usePartnerBrandingStore((state) => state.refresh)

  useEffect(() => {
    void refresh(accountId)
    const timer = window.setInterval(() => void refresh(accountId), refreshIntervalMs)
    return () => window.clearInterval(timer)
  }, [accountId, refresh])

  useEffect(() => {
    const root = document.documentElement
    if (!enabled || !branding) {
      root.removeAttribute('data-partner-theme')
      root.style.removeProperty('--partner-primary')
      root.style.removeProperty('--partner-secondary')
      root.style.removeProperty('--partner-tertiary')
      root.style.removeProperty('--partner-action')
      root.style.removeProperty('--partner-secondary-action')
      return
    }
    root.dataset.partnerTheme = 'enabled'
    root.style.setProperty('--partner-primary', branding.primaryColor)
    root.style.setProperty('--partner-secondary', branding.secondaryColor)
    root.style.setProperty('--partner-tertiary', branding.tertiaryColor)
    root.style.setProperty('--partner-action', actionColor(branding.primaryColor))
    root.style.setProperty('--partner-secondary-action', actionColor(branding.secondaryColor))
    return () => {
      root.removeAttribute('data-partner-theme')
      root.style.removeProperty('--partner-primary')
      root.style.removeProperty('--partner-secondary')
      root.style.removeProperty('--partner-tertiary')
      root.style.removeProperty('--partner-action')
      root.style.removeProperty('--partner-secondary-action')
    }
  }, [branding, enabled])

  return null
}
