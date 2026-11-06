import type { JSX } from 'react'
import { CheckboxSetting } from '../../components/CheckboxSetting'
import { useTranslation } from '../i18n/i18n'
import { useGameSettingsStore } from './game-settings.store'

export function KillCardsSetting({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const enabled = useGameSettingsStore((state) => state.killCardsEnabled)
  const saving = useGameSettingsStore((state) => state.killCardsSaving)
  const enhancements = useGameSettingsStore((state) => state.nextClientIntegrationEnabled)
  const save = useGameSettingsStore((state) => state.setKillCards)
  return (
    <CheckboxSetting
      className={className}
      label={t('settings.killCards')}
      description={t('settings.killCardsDescription')}
      checked={enabled}
      disabled={saving || !enhancements}
      onChange={(value) => void save(value)}
    />
  )
}
