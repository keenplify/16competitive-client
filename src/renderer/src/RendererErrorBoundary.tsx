/* eslint-disable react-refresh/only-export-components -- React error boundaries must be classes. */
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode
} from 'react'
import { getRendererDiagnosticLogs } from './diagnostic-logs'
import { Button } from './components/ui/Button'
import { useTranslation } from './features/i18n/i18n'

function RendererFailureScreen({ error }: { error: Error }): React.JSX.Element {
  const { t } = useTranslation()
  const [reportStatus, setReportStatus] = useState<'reporting' | 'sent' | 'failed'>('reporting')
  const autoSubmitted = useRef(false)
  const reportIssue = useCallback(async (): Promise<void> => {
    try {
      await window.api.diagnosticLogs.report(
        `Launcher screen error: ${error.name}: ${error.message.slice(0, 500)}`,
        getRendererDiagnosticLogs()
      )
      setReportStatus('sent')
    } catch (reportError) {
      console.error('[Renderer] Could not report screen error', reportError)
      setReportStatus('failed')
    }
  }, [error])

  useEffect(() => {
    if (autoSubmitted.current) return
    autoSubmitted.current = true
    void reportIssue()
  }, [reportIssue])

  const retryReport = (): void => {
    if (reportStatus !== 'failed') return
    setReportStatus('reporting')
    void reportIssue()
  }
  return (
    <main
      className="fixed inset-0 flex items-center justify-center bg-neutral-950 p-6 text-white"
      role="alert"
    >
      <div className="w-full max-w-xl border border-red-400/30 bg-neutral-900 p-6 shadow-2xl">
        <h1 className="text-xl font-bold">{t('app.renderErrorTitle')}</h1>
        <p className="mt-3 text-sm text-neutral-300">{t('app.renderErrorDescription')}</p>
        <pre className="mt-5 max-h-40 overflow-auto border border-white/10 bg-black/40 p-3 text-xs break-words whitespace-pre-wrap text-red-200">
          {`${error.name}: ${error.message.slice(0, 500)}`}
        </pre>
        <div className="mt-5 flex flex-wrap gap-2">
          {reportStatus === 'failed' && (
            <Button onClick={retryReport} className="min-w-36">
              {t('app.renderErrorRetryReport')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {t('app.renderErrorReload')}
          </Button>
        </div>
        <p className="mt-2 min-h-5 text-xs text-neutral-300" role="status" aria-live="polite">
          {reportStatus === 'sent'
            ? t('app.renderErrorReported')
            : reportStatus === 'failed'
              ? t('app.renderErrorReportFailed')
              : t('app.renderErrorReporting')}
        </p>
      </div>
    </main>
  )
}

export class RendererErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Renderer] Unhandled screen error', error, info)
  }

  render(): ReactNode {
    return this.state.error ? (
      <RendererFailureScreen error={this.state.error} />
    ) : (
      this.props.children
    )
  }
}
