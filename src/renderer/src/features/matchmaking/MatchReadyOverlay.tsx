import { useEffect, useRef, useState, type JSX } from 'react'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { MatchFoundReadyCheck } from './MatchFoundReadyCheck'
import { useMatchmakingStore } from './matchmaking.store'
import './match-ready.css'

export function MatchReadyOverlay(): JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const match = useMatchmakingStore((state) => state.match)
  const status = useMatchmakingStore((state) => state.queueStatus)
  const deadline = useMatchmakingStore((state) => state.readyDeadline)
  const accepted = useMatchmakingStore((state) => state.acceptedPlayerIds)
  const required = useMatchmakingStore((state) => state.readyPlayersRequired)
  const response = useMatchmakingStore((state) => state.readyResponse)
  const error = useMatchmakingStore((state) => state.error)
  const respond = useMatchmakingStore((state) => state.respondReady)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => {
      window.clearInterval(timer)
      document.body.style.overflow = previousOverflow
      dialog?.close()
    }
  }, [])

  if (!match) return null
  return (
    <ModalPortal>
      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-ready-title"
        onCancel={(event) => event.preventDefault()}
        className="match-ready-dialog m-auto max-h-[calc(100dvh-2rem)] w-[min(46rem,calc(100vw-2rem))] max-w-none overflow-y-auto border-0 bg-transparent p-1 outline-none"
      >
        <MatchFoundReadyCheck
          match={match}
          acceptedPlayerIds={accepted}
          playersRequired={required}
          readyResponse={response}
          secondsRemaining={
            deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : 0
          }
          responseError={Boolean(error)}
          preparing={status === 'match_found'}
          onAccept={() => void respond(true)}
          onDecline={() => void respond(false)}
        />
      </dialog>
    </ModalPortal>
  )
}
