import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useMatchmakingStore } from './matchmaking.store'

export function MatchAbandonNotice(): JSX.Element | null {
  const notice = useMatchmakingStore((state) => state.matchAbandonNotice)
  const dismiss = useMatchmakingStore((state) => state.dismissMatchAbandonNotice)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (notice) dialogRef.current?.querySelector('button')?.focus()
  }, [notice])

  if (!notice) return null

  return (
    <ModalPortal>
      <div
        ref={dialogRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/85 p-4 backdrop-blur-sm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="match-abandon-title"
        aria-describedby="match-abandon-description"
      >
        <section className="w-full max-w-md  border border-red-400/25 bg-neutral-900 p-6 text-center shadow-2xl">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-400/10 text-red-300">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <p className="mt-4 text-xs font-bold tracking-[0.18em] text-red-300 uppercase">
            Match discarded
          </p>
          <h2 id="match-abandon-title" className="mt-2 text-2xl font-semibold text-white">
            {notice.penalized ? 'MMR penalty applied' : 'You did not connect in time'}
          </h2>
          <p id="match-abandon-description" className="mt-3 text-sm leading-6 text-neutral-300">
            {notice.message}
          </p>
          <Button
            className="mt-6 w-full bg-red-400 hover:bg-red-300 focus-visible:outline-red-300"
            onClick={dismiss}
          >
            I understand
          </Button>
        </section>
      </div>
    </ModalPortal>
  )
}
