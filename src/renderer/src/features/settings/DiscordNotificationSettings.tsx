import { Bell, LoaderCircle } from 'lucide-react'
import { useEffect, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useDiscordNotificationsStore } from './discord-notifications.store'

const messageKey = (code: string) => {
  switch (code) {
    case 'DISCORD_NOT_LINKED':
      return 'settings.discord.linkFirst' as const
    case 'DISCORD_UNAVAILABLE':
      return 'settings.discord.unavailable' as const
    case 'DISCORD_TEST_RATE_LIMIT':
      return 'settings.discord.rateLimit' as const
    case 'DISCORD_DM_FAILED':
      return 'settings.discord.dmFailed' as const
    default:
      return 'settings.discord.error' as const
  }
}

export function DiscordNotificationSettings({ connected }: { connected: boolean }): JSX.Element {
  const { t } = useTranslation()
  const status = useDiscordNotificationsStore((state) => state.status)
  const loading = useDiscordNotificationsStore((state) => state.loading)
  const saving = useDiscordNotificationsStore((state) => state.saving)
  const testing = useDiscordNotificationsStore((state) => state.testing)
  const notice = useDiscordNotificationsStore((state) => state.notice)
  const error = useDiscordNotificationsStore((state) => state.error)
  const load = useDiscordNotificationsStore((state) => state.load)
  const setEnabled = useDiscordNotificationsStore((state) => state.setEnabled)
  const test = useDiscordNotificationsStore((state) => state.test)

  useEffect(() => {
    void load()
  }, [connected, load])

  const linked = status?.linked === true
  const available = status?.available === true
  const busy = loading || saving || testing

  return (
    <section
      className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7"
      aria-labelledby="discord-notifications-title"
    >
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-5 shrink-0 text-sky-400" aria-hidden="true" />
        <div>
          <h3 id="discord-notifications-title" className="text-lg font-semibold">
            {t('settings.discord.title')}
          </h3>
          <p className="mt-1 text-sm text-neutral-400">{t('settings.discord.description')}</p>
        </div>
      </div>

      <div className="mt-5 flex min-h-16 flex-col justify-between gap-4 border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center">
        <label
          htmlFor="discord-5v5-notifications"
          className="flex min-w-0 items-center gap-3 text-sm text-neutral-100"
        >
          <input
            id="discord-5v5-notifications"
            type="checkbox"
            className="size-5 shrink-0 rounded-none accent-sky-400"
            checked={status?.enabled === true}
            disabled={!linked || !available || busy}
            onChange={(event) => void setEnabled(event.target.checked)}
          />
          {t('settings.discord.enable5v5')}
        </label>
        <Button
          variant="ghost"
          className="relative h-10 w-full shrink-0 border border-white/15 sm:w-52"
          disabled={!linked || !available || busy}
          aria-busy={testing}
          onClick={() => void test()}
        >
          {testing && (
            <LoaderCircle className="absolute left-3 size-4 animate-spin" aria-hidden="true" />
          )}
          {t(testing ? 'settings.discord.sending' : 'settings.discord.test')}
        </Button>
      </div>

      <div className="mt-2 h-16 overflow-y-auto text-sm" aria-live="polite">
        {error ? (
          <p className="text-red-300">{t(messageKey(error))}</p>
        ) : loading ? (
          <p className="text-neutral-400">{t('settings.discord.loading')}</p>
        ) : !linked ? (
          <p className="text-neutral-400">{t('settings.discord.linkFirst')}</p>
        ) : !available ? (
          <p className="text-amber-300">{t('settings.discord.unavailable')}</p>
        ) : notice ? (
          <p className="text-emerald-300">
            {t(notice === 'testSent' ? 'settings.discord.testSent' : 'settings.discord.saved')}
          </p>
        ) : null}
      </div>
    </section>
  )
}
