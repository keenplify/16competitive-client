import { useEffect, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { FindMatchButton, PlayQueueActions } from './FindMatchButton'
import { isWebRuntime } from '../../web-runtime'
import { MATCHMAKING_MODES, getMatchmakingModeLabel } from '../../../../shared/matchmaking'
import { useTranslation } from '../i18n/i18n'
import { useNavigationStore } from '../navigation/navigation.store'
import { useCustomGamesStore } from './custom-games.store'
import { MatchmakingMapPool } from './MatchmakingMapPool'
import { useMatchmakingStore } from './matchmaking.store'
import { useQueueWarmupStore } from './queue-warmup.store'

export function QueueWarmupPanel({
  className,
  friendsCollapsed = false
}: {
  className?: string
  friendsCollapsed?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const maps = useMatchmakingStore((state) => state.maps)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const warmup = useQueueWarmupStore()
  const web = isWebRuntime()
  const modes = MATCHMAKING_MODES.filter(
    (mode) =>
      mode !== '5v5' &&
      maps.some((map) => map.supportedModes.includes(mode) && (!web || map.webModes.includes(mode)))
  )
  const mode = modes.includes(warmup.mode) ? warmup.mode : modes[0]
  const availableMaps = maps.filter(
    (map) => mode && map.supportedModes.includes(mode) && (!web || map.webModes.includes(mode))
  )
  const busy = warmup.status === 'starting' || warmup.status === 'leaving'
  const active = warmup.matchId !== null
  const syncMaps = warmup.syncMaps
  useEffect(() => {
    if (!active && mode)
      syncMaps(
        mode,
        availableMaps.map((map) => map.id)
      )
  }, [active, mode, availableMaps, syncMaps])
  const selectedMapIds = warmup.selectedMapIds.filter((id) =>
    availableMaps.some((map) => map.id === id)
  )

  return (
    <section
      className={twMerge('flex min-h-0 flex-1 flex-col gap-4', className)}
      aria-label={t('warmup.tab')}
    >
      <p className="text-sm text-neutral-200">{t('warmup.description')}</p>
      {modes.length > 1 && (
        <div className="w-64 max-w-full shrink-0">
          <SelectField
            label={t('warmup.mode')}
            value={mode ?? warmup.mode}
            disabled={busy || active}
            onChange={(event) => {
              const next = modes.find((value) => value === event.target.value)
              if (next) warmup.select(next, [])
            }}
          >
            {modes.map((value) => (
              <option key={value} value={value}>
                {getMatchmakingModeLabel(value)}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {availableMaps.length > 0 ? (
        <MatchmakingMapPool
          maps={availableMaps}
          selectedMapIds={selectedMapIds}
          disabled={busy || active}
          onSelect={warmup.toggleMap}
        />
      ) : (
        <p className="min-h-0 flex-1 text-sm text-neutral-300">{t('warmup.noMaps')}</p>
      )}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p role="status" className="h-7 text-sm text-neutral-300">
          {warmup.status === 'error'
            ? t('warmup.error')
            : busy
              ? t('warmup.preparing')
              : active
                ? `${t('warmup.active')} · ${getMatchmakingModeLabel(warmup.mode)}`
                : ''}
        </p>
        <PlayQueueActions friendsCollapsed={friendsCollapsed}>
          {active && (
            <Button variant="ghost" disabled={busy} onClick={() => void warmup.leave()}>
              {t('warmup.leave')}
            </Button>
          )}
          {(!active || web) && (
            <FindMatchButton
              disabled={
                busy ||
                selectedMapIds.length === 0 ||
                queueStatus !== 'queued' ||
                (web &&
                  active &&
                  warmup.status !== 'ready' &&
                  warmup.status !== 'playing' &&
                  warmup.status !== 'error')
              }
              aria-busy={busy}
              onClick={() => {
                if (active) void warmup.launch()
                else void warmup.join()
              }}
            >
              {busy && (
                <LoaderCircle className="absolute left-3 size-4 animate-spin" aria-hidden="true" />
              )}
              <span className="relative z-10">{t(active ? 'warmup.connect' : 'warmup.join')}</span>
            </FindMatchButton>
          )}
        </PlayQueueActions>
      </div>
    </section>
  )
}

export function QueueWarmupButton({ className }: { className?: string }): JSX.Element | null {
  const { t } = useTranslation()
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const selectedMode = useMatchmakingStore((state) => state.selectedMode)
  const open = useQueueWarmupStore((state) => state.open)
  const active = useQueueWarmupStore((state) => state.matchId !== null)
  if (queueStatus !== 'queued' || selectedMode !== '5v5') return null
  return (
    <Button
      variant="tertiary"
      className={twMerge('h-8 w-full text-xs', className)}
      onClick={() => {
        open()
        useCustomGamesStore.getState().setPlayView('matchmaking')
        useNavigationStore.getState().navigate('play')
      }}
    >
      {t(active ? 'warmup.active' : 'warmup.play')}
    </Button>
  )
}
