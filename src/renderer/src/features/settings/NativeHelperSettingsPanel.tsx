import { useEffect, type JSX } from 'react'
import { FolderOpen, LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { GAME_RESOLUTION_PRESETS, isWidescreen } from '../../../../shared/game-display'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { SelectField } from '../../components/ui/SelectField'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { useNativeHelperSettingsStore } from './native-helper-settings.store'

export function NativeHelperSettingsPanel({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const accountId = useAuthStore((state) => state.session?.player.id ?? null)
  const { settings, status, load, choose, save } = useNativeHelperSettingsStore()
  useEffect(() => {
    if (accountId) void load(accountId)
  }, [accountId, load])
  useEffect(() => {
    if (!accountId) return
    const refresh = (): void => {
      if (document.visibilityState === 'visible') void load(accountId)
    }
    // A match launch can select and save a game folder in the helper while
    // this Settings page remains mounted in the browser.
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [accountId, load])
  const disabled = !settings || !['idle', 'error'].includes(status)
  const display = settings?.display ?? { resolution: 'current', widescreen: true }
  return (
    <section
      className={twMerge(
        'mt-5 space-y-6 border border-white/10 bg-neutral-900/90 p-5 sm:p-7',
        className
      )}
      aria-busy={!['idle', 'error'].includes(status)}
    >
      <p className="text-sm leading-6 text-neutral-300">{t('webHelper.localSettings')}</p>
      {(['cs16', 'cs13'] as const).map((game) => (
        <div key={game} className="space-y-3">
          <h3 className="text-lg font-semibold">
            Counter-Strike {game === 'cs16' ? '1.6' : '1.3'}
          </h3>
          <TextField
            id={`helper-${game}-folder`}
            label={t(game === 'cs16' ? 'webHelper.folder16' : 'legacy.folder')}
            value={(game === 'cs16' ? settings?.cs16FolderPath : settings?.cs13FolderPath) ?? ''}
            readOnly
            className="font-mono"
          />
          <Button
            variant="secondary"
            className="w-full gap-2 sm:w-auto"
            disabled={disabled}
            onClick={() => void choose(game)}
          >
            {status === `choosing-${game}` ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FolderOpen className="size-4" aria-hidden="true" />
            )}
            {t(game === 'cs16' ? 'webHelper.choose16' : 'legacy.choose')}
          </Button>
        </div>
      ))}
      <div className="space-y-4 border-t border-white/10 pt-6">
        <h3 className="text-lg font-semibold">{t('settings.gameDisplay')}</h3>
        <p className="text-sm leading-6 text-neutral-300">{t('settings.gameDisplayDescription')}</p>
        <SelectField
          label={t('settings.gameResolution')}
          value={display.resolution}
          disabled={disabled}
          onChange={(event) =>
            void save({
              display: { ...display, resolution: event.target.value },
              currentDisplayResolution: {
                width: Math.round(screen.width * devicePixelRatio),
                height: Math.round(screen.height * devicePixelRatio)
              }
            })
          }
        >
          <option value="current">
            {t('settings.gameResolutionAuto', {
              width: Math.round(screen.width * devicePixelRatio),
              height: Math.round(screen.height * devicePixelRatio)
            })}
          </option>
          {GAME_RESOLUTION_PRESETS.filter(
            ([width, height]) => isWidescreen({ width, height }) === display.widescreen
          ).map(([width, height]) => (
            <option key={`${width}x${height}`} value={`${width}x${height}`}>
              {width} × {height}
            </option>
          ))}
        </SelectField>
        <HelperCheckbox
          label={t('settings.gameWidescreen')}
          checked={display.widescreen}
          disabled={disabled}
          onChange={(widescreen) =>
            void save({
              display: { resolution: 'current', widescreen },
              currentDisplayResolution: {
                width: Math.round(screen.width * devicePixelRatio),
                height: Math.round(screen.height * devicePixelRatio)
              }
            })
          }
        />
      </div>
      <div className="space-y-5 border-t border-white/10 pt-6">
        <HelperCheckbox
          label={t('settings.fastSwitch')}
          checked={settings?.fastSwitchEnabled ?? true}
          disabled={disabled}
          onChange={(fastSwitchEnabled) => void save({ fastSwitchEnabled })}
        />
        <HelperCheckbox
          label={t('webHelper.enhancements')}
          checked={settings?.enhancementsEnabled ?? true}
          disabled={disabled}
          onChange={(enhancementsEnabled) => void save({ enhancementsEnabled })}
        />
        <p className="text-xs leading-6 text-amber-300">{t('settings.anticheatNotice')}</p>
        <HelperCheckbox
          label={t('settings.lightweightHud')}
          checked={settings?.lightweightHud ?? true}
          disabled={disabled || !settings?.enhancementsEnabled}
          onChange={(lightweightHud) => void save({ lightweightHud })}
        />
        <HelperCheckbox
          label={t('webHelper.killCards')}
          checked={settings?.killCardsEnabled ?? true}
          disabled={disabled || !settings?.enhancementsEnabled}
          onChange={(killCardsEnabled) => void save({ killCardsEnabled })}
        />
        <p className="text-xs leading-5 text-neutral-400">
          {t('settings.lightweightHudNextMatch')}
        </p>
      </div>
      <div className="flex min-h-12 items-center justify-between gap-3" role="status">
        <p className={twMerge('text-sm text-neutral-300', status === 'error' && 'text-red-300')}>
          {t(
            status === 'error'
              ? 'webHelper.settingsError'
              : status === 'loading'
                ? 'webHelper.settingsLoading'
                : status === 'saving'
                  ? 'webHelper.settingsSaving'
                  : 'webHelper.localSettings'
          )}
        </p>
        {status === 'error' && accountId && (
          <Button variant="secondary" onClick={() => void load(accountId)}>
            {t('webHelper.retry')}
          </Button>
        )}
      </div>
    </section>
  )
}

function HelperCheckbox({
  label,
  checked,
  disabled,
  onChange,
  className
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
  className?: string
}): JSX.Element {
  return (
    <label
      className={twMerge(
        'flex min-h-11 items-center justify-between gap-5 text-sm font-semibold text-neutral-100',
        className
      )}
    >
      {label}
      <input
        type="checkbox"
        className="size-5 shrink-0 accent-violet-500"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  )
}
