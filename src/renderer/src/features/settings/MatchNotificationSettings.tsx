import { useEffect, type JSX } from 'react'
import { Bell, LoaderCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { isWebRuntime } from '../../web-runtime'
import { useTranslation } from '../i18n/i18n'
import { useMatchNotificationsStore } from './match-notifications.store'

export function MatchNotificationSettings(): JSX.Element {
  const { t } = useTranslation()
  const { status, busy, error, load, enable, disable } = useMatchNotificationsStore()
  const web = isWebRuntime()
  useEffect(() => {
    if (web) void load()
  }, [web, load])
  return (
    <section
      className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7"
      aria-labelledby="match-notifications-title"
    >
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-5 shrink-0 text-sky-400" aria-hidden="true" />
        <div>
          <h3 id="match-notifications-title" className="text-lg font-semibold">
            {t('notify.title')}
          </h3>
          <p className="mt-1 text-sm text-neutral-400">
            {t(web ? 'notify.webDescription' : 'notify.trayDescription')}
          </p>
        </div>
      </div>
      {web && (
        <>
          <div className="mt-4 flex gap-2">
            <Button
              className="relative h-10 min-w-52"
              disabled={
                busy ||
                !status?.supported ||
                (!status.enabled && (!status.available || status.blocked))
              }
              aria-busy={busy}
              onClick={() => void (status?.enabled ? disable() : enable())}
            >
              {busy && (
                <LoaderCircle className="absolute left-3 size-4 animate-spin" aria-hidden="true" />
              )}
              {t(status?.enabled ? 'notify.disable' : 'notify.enable')}
            </Button>
            <Button
              variant="ghost"
              className="h-10 min-w-24"
              disabled={busy}
              onClick={() => void load()}
            >
              {t('notify.retry')}
            </Button>
          </div>
          <p className="mt-2 h-16 overflow-y-auto text-sm text-neutral-400" aria-live="polite">
            {t(
              busy
                ? 'notify.loading'
                : status?.blocked
                  ? 'notify.blocked'
                  : error
                    ? 'notify.error'
                    : !status?.supported
                      ? 'notify.unsupported'
                      : !status.available
                        ? 'notify.unavailable'
                        : status.enabled
                          ? 'notify.enabled'
                          : 'notify.disabled'
            )}
          </p>
        </>
      )}
    </section>
  )
}
