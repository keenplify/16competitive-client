import { useEffect, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { TabList } from '../../components/ui/TabList'
import { isWebRuntime } from '../../web-runtime'
import { MATCHMAKING_MODES, getMatchmakingModeLabel } from '../../../../shared/matchmaking'
import { useTranslation } from '../i18n/i18n'
import { useNavigationStore } from '../navigation/navigation.store'
import { useCustomGamesStore } from './custom-games.store'
import { MatchmakingMapCard } from './MatchmakingMapCard'
import { useMatchmakingStore } from './matchmaking.store'
import { useQueueWarmupStore } from './queue-warmup.store'

export function QueueWarmupPanel({ className }: { className?: string }): JSX.Element {
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
  const mapId = availableMaps.some((map) => map.id === warmup.mapId)
    ? warmup.mapId
    : (availableMaps[0]?.id ?? '')
  const busy = warmup.status === 'starting' || warmup.status === 'leaving'
  const active = warmup.matchId !== null
  const select = warmup.select
  useEffect(() => {
    if (!active && mode && (mode !== warmup.mode || mapId !== warmup.mapId)) select(mode, mapId)
  }, [active, mode, mapId, warmup.mode, warmup.mapId, select])

  return (
    <section
      className={twMerge('flex min-h-0 flex-1 flex-col gap-4', className)}
      aria-label={t('warmup.tab')}
    >
      <p className="text-sm text-neutral-200">{t('warmup.description')}</p>
      <TabList
        ariaLabel={t('warmup.mode')}
        value={mode ?? warmup.mode}
        items={modes.map((value) => ({
          value,
          label: getMatchmakingModeLabel(value),
          disabled: busy || active
        }))}
        onChange={(value) => warmup.select(value, '')}
      />
      <div
        className="grid min-h-48 flex-1 auto-rows-[minmax(12rem,1fr)] grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2 overflow-y-auto"
        aria-label={t('warmup.map')}
      >
        {availableMaps.map((map) => (
          <MatchmakingMapCard
            key={map.id}
            map={map}
            selected={map.id === mapId}
            disabled={busy || active}
            onSelect={() => mode && warmup.select(mode, map.id)}
          />
        ))}
        {availableMaps.length === 0 && (
          <p className="col-span-full text-sm text-neutral-300">{t('warmup.noMaps')}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p role="status" className="min-h-12 text-sm text-neutral-300">
          {warmup.status === 'error'
            ? t('warmup.error')
            : busy
              ? t('warmup.preparing')
              : active
                ? `${t('warmup.active')} · ${getMatchmakingModeLabel(warmup.mode)}`
                : ''}
        </p>
        <div className="flex shrink-0 gap-2">
          {active && (
            <Button variant="ghost" disabled={busy} onClick={() => void warmup.leave()}>
              {t('warmup.leave')}
            </Button>
          )}
          {(!active || web) && (
            <Button
              variant="tertiary"
              className="relative min-w-52"
              disabled={
                busy ||
                !mapId ||
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
              {t(active ? 'warmup.connect' : 'warmup.join')}
            </Button>
          )}
        </div>
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
