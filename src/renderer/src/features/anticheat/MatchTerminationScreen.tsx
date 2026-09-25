import { ShieldAlert } from 'lucide-react'
import { useEffect, useRef, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'

interface MatchTerminationScreenProps {
  banned?: boolean
  onContinue: () => void
  className?: string
}

export function MatchTerminationScreen({
  banned = false,
  onContinue,
  className
}: MatchTerminationScreenProps): JSX.Element {
  const buttonRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    buttonRef.current?.querySelector('button')?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  return (
    <div
      className={twMerge(
        'fixed inset-0 z-[100001] flex items-center justify-center overflow-y-auto bg-neutral-950/95 px-6 py-12 text-center backdrop-blur-xl',
        className
      )}
      style={{ backgroundImage: 'radial-gradient(ellipse at 50% 45%, #7f1d1d26, transparent 65%)' }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="match-terminated-title"
      aria-describedby="match-terminated-description"
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault()
          buttonRef.current?.querySelector('button')?.focus()
        }
      }}
    >
      <section className="w-full max-w-4xl">
        <ShieldAlert className="mx-auto mb-6 size-12 text-red-400" aria-hidden="true" />
        <p className="text-xs font-semibold tracking-[0.3em] text-red-300 uppercase">
          1.6 Competitive · Anti-cheat
        </p>
        <div className="my-7 border-y border-red-400/25 bg-red-950/20 px-4 py-8 sm:py-10">
          <h1
            id="match-terminated-title"
            className="text-4xl leading-tight font-black tracking-tight text-white sm:text-6xl"
          >
            MATCH TERMINATED
          </h1>
        </div>
        <p id="match-terminated-description" className="text-lg font-medium text-neutral-100">
          {banned
            ? 'Cheating was detected. Your account has been banned.'
            : 'A cheater has been detected in this match.'}
        </p>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          This match has been cancelled. No MMR will be awarded or deducted.
        </p>
        <div ref={buttonRef} className="mt-10">
          <Button
            className="min-w-48 bg-red-400 text-neutral-950 hover:bg-red-300 focus-visible:outline-red-300"
            onClick={onContinue}
          >
            {banned ? 'View ban details' : 'Continue'}
          </Button>
        </div>
      </section>
    </div>
  )
}
