import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { useTranslation } from '../i18n/i18n'
import { useGameSettingsStore } from './game-settings.store'

export function LightweightHudSetting({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const enabled = useGameSettingsStore((state) => state.lightweightHud)
  const status = useGameSettingsStore((state) => state.lightweightHudStatus)
  const save = useGameSettingsStore((state) => state.setLightweightHud)
  return (
    <div className={twMerge('mb-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7', className)}>
      <label className="flex cursor-pointer items-center justify-between gap-5">
        <span className="text-lg font-semibold">{t('settings.lightweightHud')}</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={status === 'saving'}
          onChange={(event) => void save(event.currentTarget.checked)}
          className="size-5 shrink-0 accent-violet-500"
        />
      </label>
      <p className="mt-1 text-sm leading-relaxed text-neutral-400">
        {t('settings.lightweightHudDescription')}
      </p>
      <p role="status" className="mt-2 min-h-10 text-xs text-neutral-400">
        {t(
          status === 'error'
            ? 'settings.lightweightHudError'
            : status === 'saving'
              ? 'settings.lightweightHudSaving'
              : 'settings.lightweightHudNextMatch'
        )}
      </p>
    </div>
  )
}
