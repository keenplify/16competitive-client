import { Clipboard, Download, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MatchmakingEvent } from '../../../../shared/matchmaking'
import { getRendererDiagnosticLogs } from '../../diagnostic-logs'

export function SkinAssetSyncIndicator(): React.JSX.Element | null {
  const [progress, setProgress] = useState<Extract<
    MatchmakingEvent,
    { type: 'skin_assets_sync_progress' }
  > | null>(null)
  const [logsCopied, setLogsCopied] = useState(false)

  useEffect(() => {
    return window.api.matchmaking.onEvent((event) => {
      if (event.type === 'skin_assets_sync_progress') setProgress(event)
    })
  }, [])

  const percentage =
    progress && progress.totalFiles > 0
      ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
      : 0
  const failed = progress?.status === 'error'
  const copyLogs = async (): Promise<void> => {
    const mainLogs = await window.api.diagnosticLogs.get()
    const logs = [...mainLogs, ...getRendererDiagnosticLogs()].join('\n')
    await navigator.clipboard.writeText(logs || 'No diagnostic logs recorded.')
    setLogsCopied(true)
    window.setTimeout(() => setLogsCopied(false), 2000)
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 text-xs">
      <p className="rounded-lg border border-amber-300/30 bg-slate-950/90 px-3 py-2 text-amber-100 shadow-xl backdrop-blur">
        Alpha Release Testing Expect Bugs
      </p>
      <button
        type="button"
        onClick={() => void copyLogs()}
        className="flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-slate-950/90 px-3 py-2 text-cyan-100 shadow-xl backdrop-blur transition hover:bg-slate-800"
      >
        <Clipboard className="size-4" aria-hidden="true" />
        {logsCopied ? 'Logs Copied' : 'Copy Logs'}
      </button>
      {progress && progress.status !== 'ready' && (
        <aside
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 shadow-xl backdrop-blur ${failed ? 'border-red-300/30 bg-red-950/90 text-red-100' : 'border-cyan-300/30 bg-slate-950/90 text-cyan-100'}`}
          role="status"
          aria-live="polite"
        >
          {failed ? (
            <Download className="size-4" aria-hidden="true" />
          ) : (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          <span>
            {failed
              ? (progress.message ?? 'Could not download skin assets.')
              : `Downloading assets — ${percentage}%`}
          </span>
        </aside>
      )}
    </div>
  )
}
