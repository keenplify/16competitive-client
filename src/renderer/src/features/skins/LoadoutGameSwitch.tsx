import { useEffect } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
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
      className={twMerge('flex min-h-10 items-center gap-2', className)}
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
        available.map((version) => (
          <Button
            key={version}
            disabled={disabled}
            aria-pressed={game === version}
            variant={game === version ? 'primary' : 'ghost'}
            onClick={() => select(version)}
          >
            Counter-Strike {version === 'cs13' ? '1.3' : '1.6'}
          </Button>
        ))
      )}
    </div>
  )
}
