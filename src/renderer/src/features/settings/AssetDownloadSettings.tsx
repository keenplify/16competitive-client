import { CheckCircle2, Download, LoaderCircle, RefreshCcw, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import type { SkinAssetSyncMode, SkinAssetSyncProgress } from '../../../../shared/game-settings'
import { Button } from '../../components/ui/Button'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useGameSettingsStore } from './game-settings.store'

const initialProgress: SkinAssetSyncProgress = {
  status: 'idle',
  completedFiles: 0,
  totalFiles: 0
}

const readableError = (error: unknown): string =>
  error instanceof Error
    ? error.message.replace(/^Error invoking remote method '.+?': Error: /, '')
    : 'Could not sync skin assets.'

export function AssetDownloadSettings(): JSX.Element {
  const savedPath = useGameSettingsStore((state) => state.savedPath)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const [progress, setProgress] = useState<SkinAssetSyncProgress>(initialProgress)
  const [requestedMode, setRequestedMode] = useState<SkinAssetSyncMode | null>(null)

  useEffect(() => {
    const removeListener = window.api.gameSettings.onAssetSyncProgress(setProgress)
    void window.api.gameSettings
      .getAssetSyncStatus()
      .then(setProgress)
      .catch(() => undefined)
    return removeListener
  }, [])

  const syncing = progress.status === 'syncing'
  const maintenanceLocked = queueStatus !== 'idle'
  const hasKnownTotal = progress.totalFiles > 0
  const percentage = hasKnownTotal
    ? Math.min(100, Math.round((progress.completedFiles / progress.totalFiles) * 100))
    : 0

  const syncAssets = async (mode: SkinAssetSyncMode): Promise<void> => {
    if (!savedPath || syncing || maintenanceLocked) return
    setRequestedMode(mode)
    setProgress((current) => ({
      status: 'syncing',
      completedFiles: 0,
      totalFiles: current.totalFiles,
      message: mode === 'repair' ? 'Repairing skin assets…' : 'Checking skin assets…'
    }))
    try {
      await window.api.gameSettings.syncAssets(mode)
    } catch (error) {
      setProgress((current) =>
        current.status === 'error'
          ? current
          : {
              status: 'error',
              completedFiles: current.completedFiles,
              totalFiles: current.totalFiles,
              message: readableError(error)
            }
      )
    } finally {
      setRequestedMode(null)
    }
  }

  const statusContent = (() => {
    if (!savedPath) {
      return (
        <p className="text-sm text-neutral-400">
          Save your Counter-Strike executable above before downloading assets.
        </p>
      )
    }
    if (progress.status === 'syncing') {
      return (
        <div className="flex items-center gap-2 text-sm text-sky-200">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          <span>
            {progress.message ?? 'Downloading skin assets…'}
            {hasKnownTotal && ` ${progress.completedFiles} / ${progress.totalFiles}`}
          </span>
        </div>
      )
    }
    if (progress.status === 'ready') {
      return (
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <span>
            Assets are up to date
            {hasKnownTotal ? ` · ${progress.totalFiles} files` : ''}
          </span>
        </div>
      )
    }
    if (progress.status === 'error') {
      return (
        <div className="flex items-start gap-2 text-sm text-red-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{progress.message ?? 'Could not sync skin assets.'}</span>
        </div>
      )
    }
    return <p className="text-sm text-neutral-400">Assets have not been checked this session.</p>
  })()

  return (
    <div className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-500 uppercase">
            Assets & downloads
          </p>
          <h3 className="mt-2 text-lg font-semibold">Game assets</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
            Download missing 1.6 Competitive models before matchmaking. Repair removes managed
            copies and downloads them again if local assets are damaged.
          </p>
        </div>
        {hasKnownTotal && progress.status === 'syncing' && (
          <span className="shrink-0 font-mono text-sm tabular-nums text-sky-300">{percentage}%</span>
        )}
      </div>

      <div className="mt-5" aria-live="polite">
        {statusContent}
      </div>

      {progress.status === 'syncing' && (
        <div
          className="relative mt-3 h-1.5 overflow-hidden bg-black/50"
          role="progressbar"
          aria-label="Skin asset download progress"
          aria-valuemin={0}
          aria-valuemax={hasKnownTotal ? progress.totalFiles : undefined}
          aria-valuenow={hasKnownTotal ? progress.completedFiles : undefined}
          aria-valuetext={hasKnownTotal ? `${percentage}% downloaded` : 'Preparing asset download'}
        >
          <div
            className={`h-full bg-sky-400 transition-[width] duration-300 ${
              hasKnownTotal ? '' : 'w-1/3 animate-pulse'
            }`}
            style={hasKnownTotal ? { width: `${percentage}%` } : undefined}
          />
        </div>
      )}

      {maintenanceLocked && (
        <p className="mt-4 text-xs text-amber-300/80">
          Asset maintenance is unavailable while matchmaking or a match is active.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          disabled={!savedPath || syncing || maintenanceLocked}
          onClick={() => void syncAssets('download')}
        >
          {syncing && requestedMode === 'download' ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="mr-2 size-4" aria-hidden="true" />
          )}
          Download assets
        </Button>
        <Button
          variant="ghost"
          className="border border-white/15 text-neutral-200 hover:bg-white/10"
          disabled={!savedPath || syncing || maintenanceLocked}
          onClick={() => void syncAssets('repair')}
        >
          {syncing && requestedMode === 'repair' ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCcw className="mr-2 size-4" aria-hidden="true" />
          )}
          Repair assets
        </Button>
      </div>
    </div>
  )
}
