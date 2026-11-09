import { useEffect } from 'react'
import { twMerge } from 'tailwind-merge'
import { HelpTooltip } from '../../components/ui/HelpTooltip'
import { useTranslation } from '../i18n/i18n'
import { useLoadoutGameStore } from './loadout-game.store'

export function LoadoutGameSwitch({
  className,
  disabled = false
}: {
  className?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const { game, available, load, select } = useLoadoutGameStore()
  useEffect(() => {
    void load()
  }, [load])
  return (
    <div
      className={twMerge('inline-flex h-9 shrink-0 items-center gap-2', className)}
      role="group"
      aria-label={t('gameSetup.loadout')}
    >
      {available.length === 0 ? (
        <span className="text-sm text-neutral-400">{t('gameSetup.required')}</span>
      ) : available.length === 1 ? (
        <span className="text-sm font-semibold">
          Counter-Strike {game === 'cs13' ? '1.3' : '1.6'}
        </span>
      ) : (
        <div className="grid grid-cols-2 border border-white/15 bg-black/25 p-1">
          {available.map((version) => (
            <button
              key={version}
              type="button"
              disabled={disabled}
              aria-pressed={game === version}
              className={twMerge(
                'min-w-20 rounded-none px-3 py-1.5 text-xs font-bold tracking-wide focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40',
                game === version ? 'bg-sky-400 text-sky-950' : 'text-neutral-400 hover:text-white'
              )}
              onClick={() => select(version)}
            >
              CS {version === 'cs13' ? '1.3' : '1.6'}
            </button>
          ))}
        </div>
      )}
      <HelpTooltip text={t('gameSetup.separate')} />
    </div>
  )
}
