import { ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'

const ANTI_CHEAT_CANCELLED_MESSAGE =
  'This game was cancelled because the server detected cheating.'

export function AntiCheatMatchCancellationNotice(): JSX.Element | null {
  const error = useMatchmakingStore((state) => state.error)
  const [dismissed, setDismissed] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const isAntiCheatCancellation = error === ANTI_CHEAT_CANCELLED_MESSAGE
  const visible = isAntiCheatCancellation && !dismissed

  useEffect(() => {
    if (!isAntiCheatCancellation) {
      const resetDismissal = window.setTimeout(() => setDismissed(false), 0)
      return () => window.clearTimeout(resetDismissal)
    }
    if (visible) dialogRef.current?.querySelector('button')?.focus()
    return undefined
  }, [isAntiCheatCancellation, visible])

  if (!visible) return null

  return (
    <ModalPortal>
      <div
        ref={dialogRef}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-950/90 p-4 backdrop-blur-sm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="anti-cheat-cancelled-title"
        aria-describedby="anti-cheat-cancelled-description"
      >
        <section className="w-full max-w-md rounded-xl border border-red-400/25 bg-neutral-900 p-6 text-center shadow-2xl">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-400/10 text-red-300">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </div>
          <p className="mt-4 text-xs font-bold tracking-[0.18em] text-red-300 uppercase">
            Anti-cheat
          </p>
          <h2 id="anti-cheat-cancelled-title" className="mt-2 text-2xl font-semibold text-white">
            Match cancelled
          </h2>
          <p
            id="anti-cheat-cancelled-description"
            className="mt-3 text-sm leading-6 text-neutral-300"
          >
            {ANTI_CHEAT_CANCELLED_MESSAGE}
          </p>
          <p className="mt-2 text-xs leading-5 text-neutral-500">
            The match will not be settled and no MMR will be awarded or deducted.
          </p>
          <Button
            className="mt-6 w-full bg-red-400 hover:bg-red-300 focus-visible:outline-red-300"
            onClick={() => setDismissed(true)}
          >
            Continue
          </Button>
        </section>
      </div>
    </ModalPortal>
  )
}
