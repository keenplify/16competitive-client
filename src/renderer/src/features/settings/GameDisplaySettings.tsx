import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  GAME_RESOLUTION_PRESETS,
  isWidescreen,
  resolveGameResolution
} from '../../../../shared/game-display'
import { SelectField } from '../../components/ui/SelectField'
import { useTranslation } from '../i18n/i18n'
import { useGameSettingsStore } from './game-settings.store'

export function GameDisplaySettings({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const display = useGameSettingsStore((state) => state.display)
  const current = useGameSettingsStore((state) => state.currentDisplayResolution)
  const loaded = useGameSettingsStore((state) => state.loaded)
  const status = useGameSettingsStore((state) => state.displayStatus)
  const save = useGameSettingsStore((state) => state.setDisplay)
  const automatic = resolveGameResolution({ ...display, resolution: 'current' }, current)
  const legacy = resolveGameResolution(display, current, 'cs13')
  const disabled = !loaded || status === 'saving'
  return (
    <div className={twMerge('mb-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7', className)}>
      <h3 className="text-lg font-semibold">{t('settings.gameDisplay')}</h3>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
        {t('settings.gameDisplayDescription')}
      </p>
      <div className="mt-5 grid items-end gap-5 sm:grid-cols-[minmax(0,20rem)_1fr]">
        <SelectField
          label={t('settings.gameResolution')}
          value={display.resolution}
          disabled={disabled}
          onChange={(event) => void save({ ...display, resolution: event.currentTarget.value })}
        >
          <option value="current">
            {t('settings.gameResolutionAuto', { width: automatic.width, height: automatic.height })}
          </option>
          {GAME_RESOLUTION_PRESETS.filter(
            ([width, height]) => isWidescreen({ width, height }) === display.widescreen
          ).map(([width, height]) => (
            <option key={`${width}x${height}`} value={`${width}x${height}`}>
              {width} × {height}
            </option>
          ))}
        </SelectField>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-neutral-200">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-violet-500"
            checked={display.widescreen}
            disabled={disabled}
            onChange={(event) =>
              void save({ resolution: 'current', widescreen: event.currentTarget.checked })
            }
          />
          {t('settings.gameWidescreen')}
        </label>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-5 text-neutral-400">
        {t('settings.gameWidescreenDescription')}
      </p>
      <p className="mt-1 text-xs leading-5 text-neutral-400">
        {t('settings.gameLegacyResolution', { width: legacy.width, height: legacy.height })}
      </p>
      <p
        role="status"
        className={twMerge(
          'mt-2 min-h-10 text-xs leading-5 text-neutral-400',
          status === 'error' && 'text-red-300'
        )}
      >
        {t(
          status === 'error'
            ? 'settings.gameDisplayError'
            : status === 'saving'
              ? 'settings.gameDisplaySaving'
              : 'settings.gameDisplayNextLaunch'
        )}
      </p>
    </div>
  )
}
