import { useEffect, type JSX } from 'react'
import { FolderOpen, LoaderCircle } from 'lucide-react'
import { toast } from 'react-toastify'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { useNativeHelperSettingsStore } from './native-helper-settings.store'

export function NativeHelperSettingsPanel({
  className,
  foldersOnly = false
}: {
  className?: string
  foldersOnly?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const accountId = useAuthStore((state) => state.session?.player.id ?? null)
  const { settings, status, errorCode, load, choose, save } = useNativeHelperSettingsStore()
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
  useEffect(() => {
    if (status === 'error' && errorCode === 'invalidInstallation')
      toast.error(t('webHelper.invalidFolder'))
  }, [status, errorCode, t])
  const busy = !['idle', 'error'].includes(status)
  const disabled = !settings || busy
  return (
    <section
      className={twMerge(
        'mt-5 w-full space-y-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7',
        className
      )}
      aria-busy={!['idle', 'error'].includes(status)}
    >
      {!foldersOnly && (
        <p className="text-sm leading-6 text-neutral-300">{t('webHelper.localSettings')}</p>
      )}
      <p className="min-h-10 text-sm text-neutral-300" role="status">
        {settings?.managedInstallations ? t('webHelper.managedInstallations') : ''}
      </p>
      {(['cs16', 'cs13'] as const).map((game) => (
        <div key={game} className="space-y-2">
          <h3 className="text-base font-semibold">
            Counter-Strike {game === 'cs16' ? '1.6' : '1.3'}
          </h3>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <TextField
              id={`helper-${game}-folder`}
              label={t(game === 'cs16' ? 'webHelper.folder16' : 'legacy.folder')}
              value={(game === 'cs16' ? settings?.cs16FolderPath : settings?.cs13FolderPath) ?? ''}
              readOnly
              className="min-w-0 font-mono"
            />
            <Button
              variant="secondary"
              className="w-full gap-2 sm:w-auto"
              disabled={busy || settings?.managedInstallations === true}
              title={
                settings?.managedInstallations ? t('webHelper.managedInstallations') : undefined
              }
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
        </div>
      ))}
      {!foldersOnly && (
        <div className="border-t border-white/10 pt-3">
          <div className="divide-y divide-white/10">
            <HelperCheckbox
              label={t('settings.fastSwitch')}
              checked={settings?.fastSwitchEnabled ?? true}
              disabled={disabled}
              onChange={(fastSwitchEnabled) => void save({ fastSwitchEnabled })}
            />
            <div>
              <HelperCheckbox
                label={t('webHelper.enhancements')}
                checked={settings?.enhancementsEnabled ?? true}
                disabled={disabled}
                onChange={(enhancementsEnabled) => void save({ enhancementsEnabled })}
              />
              <p className="pb-3 text-xs leading-5 text-amber-300">
                {t('settings.anticheatNotice')}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="flex min-h-12 items-center justify-between gap-3" role="status">
        <p className={twMerge('text-sm text-neutral-300', status === 'error' && 'text-red-300')}>
          {t(
            status === 'error'
              ? errorCode === 'invalidInstallation'
                ? 'webHelper.invalidFolder'
                : 'webHelper.settingsError'
              : status === 'loading'
                ? 'webHelper.settingsLoading'
                : status === 'saving'
                  ? 'webHelper.settingsSaving'
                  : 'webHelper.localSettings'
          )}
        </p>
        {status === 'error' && accountId && (
          <Button variant="secondary" onClick={() => void load(accountId, true)}>
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
        'flex min-h-11 items-center justify-between gap-5 py-2 text-sm font-semibold text-neutral-100',
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
