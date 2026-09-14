import { LoaderCircle, Search } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { getMatchmakingModeLabel } from '../../../../shared/matchmaking'
import { useMatchmakingStore } from './matchmaking.store'

interface MatchSearchPanelProps {
  className?: string
  variant?: 'full' | 'compact'
}

function formatQueueDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function MatchSearchPanel({
  className,
  variant = 'full'
}: MatchSearchPanelProps): JSX.Element | null {
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const queueStartedAt = useMatchmakingStore((state) => state.queueStartedAt)
  const autoFillAt = useMatchmakingStore((state) => state.autoFillAt)
  const searchStage = useMatchmakingStore((state) => state.searchStage)
  const selectedMode = useMatchmakingStore((state) => state.selectedMode)
  const selectedMapIds = useMatchmakingStore((state) => state.selectedMapIds)
  const activeRegion = useMatchmakingStore((state) => state.activeRegion)
  const allowRegionExpansion = useMatchmakingStore((state) => state.allowRegionExpansion)
  const maps = useMatchmakingStore((state) => state.maps)
  const leaveQueue = useMatchmakingStore((state) => state.leaveQueue)
  const [now, setNow] = useState(() => Date.now())

  const isJoining = queueStatus === 'joining'
  const isLeaving = queueStatus === 'leaving'
  const isSearching = isJoining || queueStatus === 'queued' || isLeaving

  useEffect(() => {
    if (!isSearching) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [isSearching])

  if (!isSearching) return null

  const elapsedSeconds = queueStartedAt
    ? Math.max(0, Math.floor((now - queueStartedAt) / 1_000))
    : 0
  const selectedMapNames = selectedMapIds.map(
    (mapId) => maps.find((map) => map.id === mapId)?.displayName ?? mapId
  )
  const autoFillTimestamp = autoFillAt ? Date.parse(autoFillAt) : Number.NaN
  const isFillingRemainingSlots =
    searchStage === 'BOT_FILL' || (Number.isFinite(autoFillTimestamp) && now >= autoFillTimestamp)
  const searchScope = isJoining
    ? 'Joining the matchmaking queue'
    : isLeaving
      ? 'Leaving the matchmaking queue'
      : isFillingRemainingSlots
        ? 'Filling remaining slots'
        : searchStage === 'EXPANDED'
          ? 'Searching other regions'
          : searchStage === 'LOCAL' || !allowRegionExpansion
            ? `Searching in ${activeRegion?.toUpperCase() ?? 'your region'}`
            : `Searching from ${activeRegion?.toUpperCase() ?? 'your region'} · Regional expansion enabled`
  const statusTitle = isJoining
    ? 'Joining matchmaking'
    : isLeaving
      ? 'Cancelling search'
      : 'Searching for a match'
  const queueDuration = queueStartedAt ? formatQueueDuration(elapsedSeconds) : '--:--'

  if (variant === 'compact') {
    return (
      <aside
        className={twMerge(
          'relative overflow-hidden border border-emerald-300/25 bg-neutral-950/90 text-white shadow-xl backdrop-blur-md',
          className
        )}
        aria-label="Match search status"
        title={`${statusTitle} · ${searchScope}`}
      >
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_16%_50%,rgba(110,231,183,0.18),transparent_55%)]" />
        <div className="relative flex items-center gap-2 px-2.5 py-2">
          <div className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10">
            <span className="absolute inset-0 animate-ping rounded-full border border-emerald-300/30" />
            <Search className="size-3 text-emerald-300" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-bold tracking-[0.18em] text-emerald-300 uppercase">
              Matchmaking
            </p>
            <p className="mt-0.5 truncate text-[10px] font-medium text-neutral-200">
              {statusTitle}
            </p>
          </div>
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-neutral-300">
            {queueDuration}
          </span>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={twMerge(
        'overflow-hidden border border-emerald-300/25 bg-neutral-950/90 text-white shadow-2xl',
        className
      )}
      aria-label="Match search status"
      aria-live="polite"
    >
      <div className="relative overflow-hidden border-b border-white/10 bg-emerald-400/10 px-4 py-4">
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_15%_50%,rgba(110,231,183,0.12),transparent_45%)]" />
        <div className="relative flex items-center gap-3">
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10">
            <span className="absolute inset-0 animate-ping rounded-full border border-emerald-300/30" />
            <Search className="size-4 text-emerald-300" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-[0.2em] text-emerald-300 uppercase">
              Matchmaking
            </p>
            <h2 className="mt-0.5 truncate text-sm font-semibold">{statusTitle}</h2>
          </div>
          <LoaderCircle
            className="size-4 shrink-0 animate-spin text-emerald-300"
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-neutral-400">
            {selectedMapNames.join(', ') || 'Selected maps'} ·{' '}
            {getMatchmakingModeLabel(selectedMode)}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-neutral-200">{queueDuration}</span>
        </div>
        <p className="mt-2 text-[11px] text-emerald-200/80">{searchScope}</p>
        <Button
          className="mt-3 h-8 w-full rounded-none border border-white/10 bg-white/5 text-[11px] tracking-[0.14em] text-neutral-300 uppercase hover:bg-white/10 hover:text-white"
          variant="ghost"
          disabled={isJoining || isLeaving}
          onClick={() => void leaveQueue()}
        >
          {isJoining ? 'Joining…' : isLeaving ? 'Cancelling…' : 'Cancel search'}
        </Button>
      </div>
    </aside>
  )
}
