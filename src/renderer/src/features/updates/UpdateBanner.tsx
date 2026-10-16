import { useEffect, useRef, type JSX } from 'react'
import { AlertTriangle, Download, Power, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useUpdaterStore } from './updater.store'
import { useTranslation } from '../i18n/i18n'
import { guardUpdateTranslations } from '../../../../shared/guard-update-translations'
import { updateRecoveryTranslations } from '../../../../shared/update-recovery-translations'

export function UpdateBanner(): JSX.Element | null {
  const { language } = useTranslation()
  const copy = guardUpdateTranslations[language]
  const recovery = updateRecoveryTranslations[language]
  const status = useUpdaterStore((state) => state.status)
  const startListening = useUpdaterStore((state) => state.startListening)
  const stopListening = useUpdaterStore((state) => state.stopListeningToUpdates)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    startListening()
    return stopListening
  }, [startListening, stopListening])

  const isBlocking =
    status.state === 'available' ||
    status.state === 'downloading' ||
    status.state === 'downloaded' ||
    (status.state === 'error' && Boolean(status.requiredVersion))

  useEffect(() => {
    if (!isBlocking) return

    console.info('[WindowDebug]', 'update keyboard blocker enabled', { state: status.state })
    const blockKeyboardInput = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' && event.type === 'keydown') {
        const buttons =
          dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (buttons?.length) {
          const first = buttons[0]
          const last = buttons[buttons.length - 1]
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === dialogRef.current)
          ) {
            event.preventDefault()
            last.focus()
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === dialogRef.current)
          ) {
            event.preventDefault()
            first.focus()
          }
        } else event.preventDefault()
      }
      // Keep launcher shortcuts out while allowing native button activation.
      if (!['Tab', 'Enter', ' '].includes(event.key)) event.stopPropagation()
    }
    window.addEventListener('keydown', blockKeyboardInput, true)
    window.addEventListener('keyup', blockKeyboardInput, true)
    dialogRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', blockKeyboardInput, true)
      window.removeEventListener('keyup', blockKeyboardInput, true)
    }
  }, [isBlocking, status.state])

  if (
    status.state === 'idle' ||
    status.state === 'checking' ||
    (status.state === 'error' && !status.requiredVersion)
  )
    return null

  let content: { icon: JSX.Element; message: string; failed?: boolean }
  switch (status.state) {
    case 'available':
      content = {
        icon: <Download className="size-4" aria-hidden="true" />,
        message: copy.downloading
      }
      break
    case 'downloading':
      content = {
        icon: <Download className="size-4" aria-hidden="true" />,
        message: `${copy.downloading} ${status.percent}%`
      }
      break
    case 'downloaded':
      content = {
        icon: <RefreshCw className="size-4" aria-hidden="true" />,
        message: copy.restarting
      }
      break
    case 'error':
      content = {
        icon: <AlertTriangle className="size-4" aria-hidden="true" />,
        message: status.failure === 'install' ? recovery.installFailed : copy.failed,
        failed: true
      }
      break
  }

  return (
    <aside
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/95 p-6 text-neutral-100 backdrop-blur-md"
      aria-live="assertive"
      aria-modal="true"
      role="alertdialog"
      aria-labelledby="update-dialog-title"
      aria-describedby="update-dialog-message"
    >
      <div className="flex w-full max-w-lg flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center bg-amber-300/10 text-amber-300">
          {content.icon}
        </div>
        <div>
          <h2 id="update-dialog-title" className="text-lg font-semibold">
            {recovery.title}
          </h2>
          <p id="update-dialog-message" className="mt-2 text-sm text-neutral-300">
            {content.message}
          </p>
          <p className="mt-4 min-h-56 text-sm leading-relaxed text-neutral-300">
            {content.failed ? recovery.details : recovery.restarting}
          </p>
          <div
            className={`mt-5 flex min-h-12 flex-wrap justify-center gap-3 ${content.failed ? '' : 'invisible'}`}
            aria-hidden={!content.failed}
          >
            <Button disabled={!content.failed} onClick={() => void window.api.updater.retry()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              {copy.retry}
            </Button>
            <Button
              disabled={!content.failed}
              onClick={() => void window.api.updater.openDownload()}
            >
              <Download className="mr-2 size-4" aria-hidden="true" />
              {recovery.download}
            </Button>
            <Button disabled={!content.failed} onClick={() => void window.api.window.exit()}>
              <Power className="mr-2 size-4" aria-hidden="true" />
              {copy.exit}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
