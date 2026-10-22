import { useLauncherThemeStore } from '../settings/launcher-theme.store'
import { useEffectiveLauncherTheme } from '../settings/use-effective-launcher-theme'
import { useEffect, type JSX } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { usePartnerBrandingStore } from './partner-branding.store'
import { actionColor, vguiPalette } from './palette'

const refreshIntervalMs = 30_000

export function PartnerThemeController(): JSX.Element | null {
  const theme = useLauncherThemeStore((state) => state.theme)
  const effectiveTheme = useEffectiveLauncherTheme()
  const hasPreference = useLauncherThemeStore((state) => state.hasPreference)
  const communityTheme = !hasPreference || theme === 'community'
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
    root.dataset.launcherTheme = theme
    if (!enabled || !branding || !communityTheme) {
      root.removeAttribute('data-partner-theme')
      root.style.removeProperty('--partner-primary')
      root.style.removeProperty('--partner-secondary')
      root.style.removeProperty('--partner-tertiary')
      root.style.removeProperty('--partner-action')
      root.style.removeProperty('--partner-secondary-action')
      return
    }
    const vgui = effectiveTheme === 'vgui2'
    root.dataset.launcherTheme = effectiveTheme
    const palette = vgui ? vguiPalette(branding) : {}
    for (const [property, value] of Object.entries(palette)) root.style.setProperty(property, value)
    root.dataset.partnerTheme = 'enabled'
    root.style.setProperty('--partner-primary', branding.primaryColor)
    root.style.setProperty('--partner-secondary', branding.secondaryColor)
    root.style.setProperty('--partner-tertiary', branding.tertiaryColor)
    root.style.setProperty('--partner-action', actionColor(branding.primaryColor))
    root.style.setProperty('--partner-secondary-action', actionColor(branding.secondaryColor))
    return () => {
      root.dataset.launcherTheme = useLauncherThemeStore.getState().theme
      for (const property of Object.keys(palette)) root.style.removeProperty(property)
      root.removeAttribute('data-partner-theme')
      root.style.removeProperty('--partner-primary')
      root.style.removeProperty('--partner-secondary')
      root.style.removeProperty('--partner-tertiary')
      root.style.removeProperty('--partner-action')
      root.style.removeProperty('--partner-secondary-action')
    }
  }, [branding, enabled, communityTheme, theme, effectiveTheme])

  return null
}
