import { usePartnerBrandingStore } from '../partner-branding/partner-branding.store'
import { useLauncherThemeStore, type LauncherTheme } from './launcher-theme.store'

/** Resolve community appearance for both React layout and the CSS theme. */
export function useEffectiveLauncherTheme(): LauncherTheme {
  const theme = useLauncherThemeStore((state) => state.theme)
  const hasPreference = useLauncherThemeStore((state) => state.hasPreference)
  const enabled = usePartnerBrandingStore((state) => state.enabled)
  const branding = usePartnerBrandingStore((state) => state.branding)

  if (enabled && branding && (!hasPreference || theme === 'community')) {
    return branding.launcherTheme === 'vgui2' ? 'vgui2' : 'community'
  }
  return theme
}
