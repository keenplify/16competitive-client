import { useEffect, type JSX } from 'react'
import { AlertCircle, Download, LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useUpdaterStore } from './updater.store'

export function UpdateBanner(): JSX.Element | null {
  const status = useUpdaterStore((state) => state.status)
  const startListening = useUpdaterStore((state) => state.startListening)
  const stopListening = useUpdaterStore((state) => state.stopListeningToUpdates)
  const restartAndInstall = useUpdaterStore((state) => state.restartAndInstall)

  useEffect(() => {
    startListening()
    return stopListening
  }, [startListening, stopListening])

  if (status.state === 'idle') return null

  let content: { icon: JSX.Element; message: string }
  switch (status.state) {
    case 'checking':
      content = {
        icon: <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />,
        message: 'Checking for launcher updates…'
      }
      break
    case 'available':
      content = {
        icon: <Download className="size-4" aria-hidden="true" />,
        message: `Update ${status.version} found. Downloading…`
      }
      break
    case 'downloading':
      content = {
        icon: <Download className="size-4" aria-hidden="true" />,
        message: `Downloading update ${status.version || ''} — ${status.percent}%`
      }
      break
    case 'downloaded':
      content = {
        icon: <RefreshCw className="size-4" aria-hidden="true" />,
        message: `Update ${status.version} is ready.`
      }
      break
    case 'error':
      content = {
        icon: <AlertCircle className="size-4" aria-hidden="true" />,
        message: status.message
      }
      break
  }

  return (
    <aside
      className="fixed top-0 right-0 left-0 z-50 flex min-h-10 items-center justify-center gap-3 border-b border-amber-300/20 bg-neutral-900/95 px-4 py-2 text-sm text-neutral-100 shadow-lg backdrop-blur"
      aria-live="polite"
      role="status"
    >
      {content.icon}
      <span>{content.message}</span>
      {status.state === 'downloaded' && (
        <Button className="h-7 px-3 text-xs" onClick={() => void restartAndInstall()}>
          Restart now
        </Button>
      )}
    </aside>
  )
}
