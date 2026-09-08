import { Download, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MatchmakingEvent } from '../../../../shared/matchmaking'

export function SkinAssetSyncIndicator(): React.JSX.Element | null {
  const [progress, setProgress] = useState<Extract<MatchmakingEvent, { type: 'skin_assets_sync_progress' }> | null>(null)

  useEffect(() => {
    return window.api.matchmaking.onEvent((event) => {
      if (event.type === 'skin_assets_sync_progress') setProgress(event)
    })
  }, [])

  if (!progress || progress.status === 'ready') return null
  const percentage = progress.totalFiles > 0
    ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
    : 0
  const failed = progress.status === 'error'
  return (
    <aside
      className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl backdrop-blur ${failed ? 'border-red-300/30 bg-red-950/90 text-red-100' : 'border-cyan-300/30 bg-slate-950/90 text-cyan-100'}`}
      role="status"
      aria-live="polite"
    >
      {failed ? <Download className="size-4" aria-hidden="true" /> : <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      <span>{failed ? 'Asset download failed — retrying later' : `Downloading assets — ${percentage}%`}</span>
    </aside>
  )
}
