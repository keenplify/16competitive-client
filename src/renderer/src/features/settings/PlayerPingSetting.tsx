import type { JSX } from 'react'
import { Crosshair, LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { PLAYER_PING_KEYS, parsePlayerPingKey } from '../../../../shared/player-ping'
import { useTranslation } from '../i18n/i18n'
import { useGameSettingsStore } from './game-settings.store'

export function PlayerPingSetting({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const key = useGameSettingsStore((state) => state.playerPingKey)
  const saving = useGameSettingsStore((state) => state.pingSaving)
  const failed = useGameSettingsStore((state) => state.pingSaveFailed)
  const save = useGameSettingsStore((state) => state.setPlayerPingKey)
  return (
    <section
      className={twMerge('mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7', className)}
    >
      <div className="flex items-center gap-2">
        <Crosshair className="size-5 text-amber-300" aria-hidden="true" />
        <h3 className="text-lg font-semibold">{t('settings.playerPing')}</h3>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">
        {t('settings.playerPingDescription')}
      </p>
      <label className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold">{t('settings.playerPingKey')}</span>
        <select
          className="h-10 w-36 shrink-0 border border-white/20 bg-neutral-950 px-3 font-mono text-sm outline-none focus:border-sky-400 disabled:opacity-60"
          value={key}
          disabled={saving}
          onChange={(event) => void save(parsePlayerPingKey(event.currentTarget.value))}
        >
          {PLAYER_PING_KEYS.map((value) => (
            <option key={value} value={value}>
              {value === 'NONE' ? t('settings.playerPingDisabled') : value}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex h-16 items-start gap-2 text-xs" aria-live="polite">
        <span className="inline-flex size-4 shrink-0 items-center justify-center">
          {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        </span>
        <span className={failed ? 'text-red-400' : 'text-neutral-500'}>
          {t(
            failed
              ? 'settings.playerPingSaveFailed'
              : saving
                ? 'settings.playerPingSaving'
                : 'settings.playerPingNextMatch'
          )}
        </span>
      </div>
    </section>
  )
}
