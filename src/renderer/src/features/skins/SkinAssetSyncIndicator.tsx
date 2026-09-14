import { Clipboard, Download, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MatchmakingEvent } from '../../../../shared/matchmaking'
import { getRendererDiagnosticLogs } from '../../diagnostic-logs'

type RailMode = 'expanded' | 'collapsed' | 'absent'

export function SkinAssetSyncIndicator(): React.JSX.Element | null {
  const [progress, setProgress] = useState<Extract<
    MatchmakingEvent,
    { type: 'skin_assets_sync_progress' }
  > | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportStatus, setReportStatus] = useState('')
  const [railMode, setRailMode] = useState<RailMode>('absent')

  useEffect(() => {
    return window.api.matchmaking.onEvent((event) => {
      if (event.type === 'skin_assets_sync_progress') setProgress(event)
    })
  }, [])

  useEffect(() => {
    const detectRail = (): void => {
      const rail = document.querySelector<HTMLElement>(
        'aside[aria-label="Friends panel"], aside[aria-label="Expand Friends panel"]'
      )
      if (!rail || rail.getClientRects().length === 0) {
        setRailMode('absent')
        return
      }
      setRailMode(
        rail.getAttribute('aria-label') === 'Expand Friends panel' ? 'collapsed' : 'expanded'
      )
    }

    detectRail()
    const observer = new MutationObserver(detectRail)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'class']
    })
    window.addEventListener('resize', detectRail)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', detectRail)
    }
  }, [])

  const percentage =
    progress && progress.totalFiles > 0
      ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
      : 0
  const failed = progress?.status === 'error'
  const reportPosition =
    railMode === 'expanded'
      ? 'right-4 bottom-[calc(55vh+1rem)] md:right-[19rem] md:bottom-4'
      : railMode === 'collapsed'
        ? 'right-[3.75rem] bottom-4'
        : 'right-4 bottom-4'

  const reportIssue = async (): Promise<void> => {
    if (!description.trim()) {
      setReportStatus('Please describe what went wrong.')
      return
    }
    setReporting(true)
    setReportStatus('')
    try {
      await window.api.diagnosticLogs.report(description.trim(), getRendererDiagnosticLogs())
      setReportStatus('Issue reported. Thank you!')
      setDescription('')
      window.setTimeout(() => {
        setReportOpen(false)
        setReportStatus('')
      }, 2000)
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : 'Could not report issue.')
    } finally {
      setReporting(false)
    }
  }

  return (
    <div
      className={`fixed ${reportPosition} z-40 flex flex-col items-end gap-2 text-xs transition-[right,bottom] duration-300`}
    >
      <p className="rounded-lg border border-amber-300/30 bg-slate-950/90 px-3 py-2 shadow-xl backdrop-blur text-yellow-400">
        Alpha Release Testing <b>Expect Bugs</b>
      </p>
      <button
        type="button"
        onClick={() => setReportOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-slate-950/90 px-3 py-2 text-cyan-100 shadow-xl backdrop-blur transition hover:bg-slate-800"
      >
        <Clipboard className="size-4" aria-hidden="true" />
        Report an Issue
      </button>
      {reportOpen && (
        <div className="w-80 rounded-lg border border-cyan-300/30 bg-slate-950/95 p-3 text-left text-cyan-100 shadow-xl backdrop-blur">
          <p className="mb-2 font-medium">What went wrong?</p>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={10_000}
            rows={4}
            className="w-full resize-y rounded border border-slate-700 bg-slate-900 p-2 text-xs text-white outline-none focus:border-cyan-300"
            placeholder="Tell us what happened and what you expected."
          />
          {reportStatus && <p className="mt-2 text-amber-200">{reportStatus}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              disabled={reporting}
              className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void reportIssue()}
              disabled={reporting}
              className="rounded bg-cyan-700 px-2 py-1 text-white hover:bg-cyan-600"
            >
              {reporting ? 'Reporting…' : 'Submit report'}
            </button>
          </div>
        </div>
      )}
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
