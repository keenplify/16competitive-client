import { useEffect, type JSX } from 'react'
import { Monitor, PanelsTopLeft, Users } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { ChoiceCard } from '../../components/ui/ChoiceCard'
import { useTranslation } from '../i18n/i18n'
import { useLauncherThemeStore } from './launcher-theme.store'
import { usePartnerBrandingStore } from '../partner-branding/partner-branding.store'

export function LauncherThemeSetting({
  className,
  onboarding = false
}: {
  className?: string
  onboarding?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const theme = useLauncherThemeStore((state) => state.theme)
  const setTheme = useLauncherThemeStore((state) => state.setTheme)
  const offerCommunityDefault = useLauncherThemeStore((state) => state.offerCommunityDefault)
  const branding = usePartnerBrandingStore((state) => state.branding)
  const enabled = usePartnerBrandingStore((state) => state.enabled)
  const setEnabled = usePartnerBrandingStore((state) => state.setEnabled)
  const hasPreference = useLauncherThemeStore((state) => state.hasPreference)

  useEffect(() => {
    if (onboarding && branding && !hasPreference) {
      setEnabled(true)
      offerCommunityDefault()
    }
  }, [onboarding, branding, hasPreference, setEnabled, offerCommunityDefault])

  // Before a player chooses, preserve the existing community-theme preference.
  const communitySelected = Boolean(
    branding && enabled && (theme === 'community' || !hasPreference)
  )

  return (
    <section className={twMerge('min-w-0', className)}>
      <fieldset className="min-w-0 w-full">
        <legend className={onboarding ? 'sr-only' : 'text-lg font-semibold text-white'}>
          {t('theme.title')}
        </legend>
        {!onboarding && <p className="mt-1 text-sm text-neutral-400">{t('theme.description')}</p>}
        <div className={twMerge('grid gap-3', !onboarding && 'mt-4')}>
          {branding && (
            <ChoiceCard
              title={t('theme.community')}
              description={t('theme.communityDescription', {
                community: branding.communityName ?? t('theme.community')
              })}
              icon={<Users className="size-5" aria-hidden="true" />}
              selected={communitySelected}
              onClick={() => {
                setEnabled(true)
                setTheme('community')
              }}
            />
          )}
          <ChoiceCard
            title={t('theme.latest')}
            description={t('theme.latestDescription')}
            icon={<Monitor className="size-5" aria-hidden="true" />}
            selected={!communitySelected && theme !== 'vgui2'}
            onClick={() => setTheme('latest')}
          />
          <ChoiceCard
            title="VGUI2"
            description={t('theme.vguiDescription')}
            icon={<PanelsTopLeft className="size-5" aria-hidden="true" />}
            selected={theme === 'vgui2'}
            onClick={() => setTheme('vgui2')}
          />
        </div>
        <p className="mt-3 text-xs text-neutral-400">{t('theme.help')}</p>
      </fieldset>
    </section>
  )
}
