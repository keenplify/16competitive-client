import { Check, Copy, LoaderCircle } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { useReferralStore } from './referral.store'

export function ReferralSettings(): JSX.Element {
  const playerId = useAuthStore((state) => state.session?.player.id)
  const code = useReferralStore((state) => state.code)
  const loadedPlayerId = useReferralStore((state) => state.playerId)
  const status = useReferralStore((state) => state.status)
  const error = useReferralStore((state) => state.error)
  const load = useReferralStore((state) => state.load)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const visibleCode = loadedPlayerId === playerId ? code : null

  useEffect(() => {
    if (playerId) void load(playerId)
  }, [load, playerId])

  const copy = async (): Promise<void> => {
    if (!visibleCode) return
    try {
      await navigator.clipboard.writeText(visibleCode)
      setCopied(true)
      setCopyError(false)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
      setCopyError(true)
    }
  }

  return (
    <div className="mb-5 border border-sky-400/20 bg-sky-400/5 p-5 sm:p-7">
      <h3 className="text-lg font-semibold">Invite a friend</h3>
      <p className="mt-1 text-sm text-neutral-400">
        Share your referral code. When a friend uses it, you both receive rewards.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex h-11 min-w-0 flex-1 items-center border border-white/15 bg-slate-950/80 px-4 font-mono text-base tracking-wider text-white">
          {status === 'loading' ? (
            <LoaderCircle
              className="size-4 animate-spin text-sky-300"
              aria-label="Loading referral code"
            />
          ) : visibleCode ? (
            <span className="select-text">{visibleCode}</span>
          ) : (
            <span className="text-neutral-500">Code unavailable</span>
          )}
        </div>
        <Button
          variant="secondary"
          className="w-28 gap-2"
          disabled={!visibleCode}
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="mt-3 min-h-5 text-xs text-red-400" aria-live="polite">
        {error && <p>{error}</p>}
        {copyError && <p>Select the code above to copy it manually.</p>}
      </div>
      {status === 'error' && playerId && (
        <Button variant="ghost" className="px-0 text-sky-300" onClick={() => void load(playerId)}>
          Retry
        </Button>
      )}
    </div>
  )
}
