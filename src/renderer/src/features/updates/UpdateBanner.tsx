import { useEffect, useRef, type JSX } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { useUpdaterStore } from './updater.store'

export function UpdateBanner(): JSX.Element | null {
  const status = useUpdaterStore((state) => state.status)
  const startListening = useUpdaterStore((state) => state.startListening)
  const stopListening = useUpdaterStore((state) => state.stopListeningToUpdates)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    startListening()
    return stopListening
  }, [startListening, stopListening])

  const isBlocking =
    status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded'

  useEffect(() => {
    if (!isBlocking) return

    const blockKeyboardInput = (event: KeyboardEvent): void => event.preventDefault()
    window.addEventListener('keydown', blockKeyboardInput, true)
    window.addEventListener('keyup', blockKeyboardInput, true)
    dialogRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', blockKeyboardInput, true)
      window.removeEventListener('keyup', blockKeyboardInput, true)
    }
  }, [isBlocking])

  if (status.state === 'idle' || status.state === 'checking' || status.state === 'error')
    return null

  let content: { icon: JSX.Element; message: string }
  switch (status.state) {
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
        message: `Update ${status.version} is ready. Restarting launcher…`
      }
      break
  }

  return (
    <aside
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 p-6 text-neutral-100 backdrop-blur-md"
      aria-live="assertive"
      aria-modal="true"
      role="alertdialog"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-300/10 text-amber-300">
          {content.icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold">Launcher update required</h2>
          <p className="mt-2 text-sm text-neutral-300">{content.message}</p>
          <p className="mt-4 text-xs text-neutral-500">
            The launcher will restart automatically when the update is ready.
          </p>
        </div>
      </div>
    </aside>
  )
}
