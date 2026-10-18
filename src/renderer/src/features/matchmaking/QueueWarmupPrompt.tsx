import { useEffect, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { Button } from '../../components/ui/Button'
import { isWebRuntime } from '../../web-runtime'
import { MATCHMAKING_MODES, getMatchmakingModeLabel } from '../../../../shared/matchmaking'
import { useTranslation } from '../i18n/i18n'
import { useMatchmakingStore } from './matchmaking.store'
import { useQueueWarmupStore } from './queue-warmup.store'

export function QueueWarmupPrompt({ className }: { className?: string }): JSX.Element | null {
  const { t } = useTranslation()
  const queueStatus = useMatchmakingStore((s) => s.queueStatus)
  const selectedMode = useMatchmakingStore((s) => s.selectedMode)
  const maps = useMatchmakingStore((s) => s.maps)
  const warmup = useQueueWarmupStore()
  const modes = MATCHMAKING_MODES.filter(
    (mode) => mode !== '5v5' && maps.some((map) => map.supportedModes.includes(mode))
  )
  const mode = modes.includes(warmup.mode) ? warmup.mode : modes[0]
  const availableMaps = maps.filter((map) => mode && map.supportedModes.includes(mode))
  const mapId = availableMaps.some((map) => map.id === warmup.mapId)
    ? warmup.mapId
    : (availableMaps[0]?.id ?? '')
  const select = warmup.select
  useEffect(() => {
    if (mode && (mode !== warmup.mode || mapId !== warmup.mapId)) select(mode, mapId)
  }, [mode, mapId, warmup.mode, warmup.mapId, select])
  const eligible = queueStatus === 'queued' && selectedMode === '5v5'
  const busy = warmup.status === 'starting' || warmup.status === 'leaving'
  const active = warmup.matchId !== null
  useEffect(() => {
    if (!eligible || active || busy || !warmup.dismissed) return
    const timer = window.setTimeout(
      () => {
        // Do not interrupt another dialog or pull focus from a background launcher.
        if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]'))
          useQueueWarmupStore.getState().open()
        else useQueueWarmupStore.getState().deferReminder()
      },
      Math.max(0, warmup.remindAt - Date.now())
    )
    return () => window.clearTimeout(timer)
  }, [eligible, active, busy, warmup.dismissed, warmup.remindAt])
  if (!eligible) return null
  return (
    <ModalDialog
      open={!warmup.dismissed}
      onClose={warmup.dismiss}
      labelledBy="queue-warmup-title"
      describedBy="queue-warmup-description"
      className={twMerge('max-w-lg p-6', className)}
    >
      <h2 id="queue-warmup-title" className="text-base font-semibold">
        {t(active ? 'warmup.active' : 'warmup.title')}
      </h2>
      <p id="queue-warmup-description" className="mt-2 text-sm leading-relaxed text-neutral-300">
        {t('warmup.description')}
      </p>
      {!active && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="min-w-0 text-xs text-neutral-300">
            {t('warmup.mode')}
            <select
              value={mode ?? ''}
              disabled={busy}
              onChange={(event) => {
                const next = modes.find((value) => value === event.target.value)
                if (next) warmup.select(next, '')
              }}
              className="mt-1 block h-10 w-full rounded-none border border-white/20 bg-neutral-900 px-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {modes.map((value) => (
                <option key={value} value={value}>
                  {getMatchmakingModeLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs text-neutral-300">
            {t('warmup.map')}
            <select
              value={mapId}
              disabled={busy}
              onChange={(event) => mode && warmup.select(mode, event.target.value)}
              className="mt-1 block h-10 w-full rounded-none border border-white/20 bg-neutral-900 px-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {availableMaps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p role="status" className="mt-3 min-h-14 text-xs leading-relaxed text-neutral-300">
        {warmup.status === 'error'
          ? t('warmup.error')
          : busy
            ? t('warmup.preparing')
            : active
              ? `${getMatchmakingModeLabel(warmup.mode)} · ${warmup.mapId}`
              : t('warmup.bots')}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          className="h-auto min-h-11 gap-2 py-2"
          disabled={busy || (!active && !mapId)}
          onClick={() => {
            if (active && isWebRuntime()) void warmup.launch()
            else if (active) void warmup.leave()
            else void warmup.join()
          }}
        >
          <span className="inline-flex size-4 shrink-0 items-center" aria-hidden="true">
            {busy && <LoaderCircle className="size-4 animate-spin" />}
          </span>
          {t(active ? (isWebRuntime() ? 'warmup.connect' : 'warmup.leave') : 'warmup.play')}
        </Button>
        <Button
          className="h-auto min-h-11 gap-2 py-2"
          variant="secondary"
          disabled={busy}
          onClick={warmup.dismiss}
        >
          {t('warmup.wait')}
        </Button>
      </div>
      {active && isWebRuntime() && <Button variant="ghost" className="mt-3 w-full" disabled={busy} onClick={() => void warmup.leave()}>{t('warmup.leave')}</Button>}
    </ModalDialog>
  )
}

export function QueueWarmupButton({ className }: { className?: string }): JSX.Element | null {
  const { t } = useTranslation()
  const queueStatus = useMatchmakingStore((s) => s.queueStatus)
  const selectedMode = useMatchmakingStore((s) => s.selectedMode)
  const open = useQueueWarmupStore((s) => s.open)
  const active = useQueueWarmupStore((s) => s.matchId !== null)
  if (queueStatus !== 'queued' || selectedMode !== '5v5') return null
  return (
    <Button
      variant="secondary"
      className={twMerge('m-3 w-[calc(100%-1.5rem)]', className)}
      onClick={open}
    >
      {t(active ? 'warmup.active' : 'warmup.play')}
    </Button>
  )
}
