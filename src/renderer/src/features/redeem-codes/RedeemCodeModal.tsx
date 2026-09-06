import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { CheckCircle2, LoaderCircle, Ticket, X } from 'lucide-react'
import type { RedeemCodeResult } from '../../../../shared/redeem-codes'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from '../auth/auth.store'

interface RedeemCodeModalProps {
  onClose: () => void
  onRedeemed: () => void | Promise<void>
}

export function RedeemCodeModal({ onClose, onRedeemed }: RedeemCodeModalProps): JSX.Element {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RedeemCodeResult | null>(null)
  const refreshSession = useAuthStore((state) => state.refreshSession)
  const setPoints = useAuthStore((state) => state.setPoints)
  const isSubmitting = status === 'submitting'

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isSubmitting) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isSubmitting, onClose])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmedCode = code.trim()
    if (!trimmedCode) {
      setError('Enter a redeem code.')
      return
    }

    setStatus('submitting')
    setError(null)
    void window.api.redeemCodes
      .redeem(trimmedCode)
      .then((response) => {
        if (!response.ok) {
          setError(response.message)
          setStatus('idle')
          return
        }
        setPoints(response.result.points)
        setResult(response.result)
        setStatus('success')
        void Promise.allSettled([refreshSession(), Promise.resolve(onRedeemed())])
      })
      .catch(() => {
        setError('Could not redeem the code. Please try again.')
        setStatus('idle')
      })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="redeem-code-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose()
      }}
    >
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-300/10 text-amber-300">
              <Ticket className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="redeem-code-title" className="text-xl font-semibold text-white">
                Redeem Code
              </h2>
              <p className="mt-1 text-sm text-neutral-400">Claim points or an inventory reward.</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-neutral-500 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40"
            aria-label="Close redeem code dialog"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {status === 'success' && result ? (
          <div className="mt-6">
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-5 text-emerald-300" aria-hidden="true" />
                Code redeemed
              </p>
              <p className="mt-3">
                You received {result.pointsGranted.toLocaleString()} points. Your new balance is{' '}
                {result.points.toLocaleString()} points.
              </p>
              {result.skinGranted && (
                <p className="mt-2">The reward skin was added to your inventory.</p>
              )}
              {result.skinId && !result.skinGranted && (
                <p className="mt-2">You already owned the reward skin.</p>
              )}
            </div>
            <Button className="mt-5 w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form className="mt-6" onSubmit={submit}>
            <TextField
              id="redeem-code"
              label="Code"
              value={code}
              minLength={3}
              maxLength={64}
              autoComplete="off"
              autoFocus
              placeholder="WELCOME_2026"
              className="font-mono uppercase"
              disabled={isSubmitting}
              onChange={(event) => {
                setCode(event.target.value)
                setError(null)
              }}
            />
            <div className="mt-3 min-h-5" aria-live="polite">
              {error && <p className="text-sm text-rose-300">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="ghost" disabled={isSubmitting} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || code.trim().length < 3}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    Redeeming…
                  </>
                ) : (
                  'Redeem'
                )}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
