import { ModalDialog } from '../../components/ui/ModalDialog'
import { AlertTriangle } from 'lucide-react'
import { type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useMatchmakingStore } from './matchmaking.store'

export function MatchAbandonNotice(): JSX.Element | null {
  const notice = useMatchmakingStore((state) => state.matchAbandonNotice)
  const dismiss = useMatchmakingStore((state) => state.dismissMatchAbandonNotice)

  if (!notice) return null

  return (
    <>
      <ModalDialog
        open
        onClose={dismiss}
        className="w-[calc(100%-2rem)] max-w-md  border border-red-400/25 bg-neutral-900 p-6 text-center shadow-2xl"
        labelledBy="match-abandon-title"
        describedBy="match-abandon-description"
        role="alertdialog"
      >
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
      </ModalDialog>
    </>
  )
}
