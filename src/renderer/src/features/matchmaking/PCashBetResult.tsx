import { CurrencyAmount, CurrencyIcon } from '../../components/CurrencyIcon'
import { useEffect } from 'react'
import { twMerge } from 'tailwind-merge'
import { PCASH_BET_MODES, type PCashBetSnapshot } from '../../../../shared/pcash-bets'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { Button } from '../../components/ui/Button'
import { usePCashBetsStore } from './pcash-bets.store'

export function PCashBetResultView({
  snapshot,
  error = false,
  onRetry,
  className
}: {
  snapshot: PCashBetSnapshot | null
  error?: boolean
  onRetry?: () => void
  className?: string
}): React.JSX.Element {
  const { t, language } = useTranslation()
  const bet = snapshot?.bet
  const money = (amount: number): string => amount.toLocaleString(language)
  const partner = bet ? Math.floor((bet.stake * 2 * snapshot!.partnerBps) / 10000) : 0
  const platform = bet ? Math.floor((bet.stake * 2 * snapshot!.platformBps) / 10000) : 0
  return (
    <section
      aria-label={t('bet.resultTitle')}
      className={twMerge(
        'h-36 overflow-y-auto border border-white/15 bg-black/35 p-4 text-left',
        className
      )}
      role="status"
    >
      <h2 className="text-sm font-semibold text-neutral-200">{t('bet.resultTitle')}</h2>
      <p
        className={twMerge(
          'mt-2 flex items-center gap-2 text-xl font-bold tabular-nums',
          bet?.status === 'WON' ? 'text-amber-200' : 'text-white'
        )}
      >
        {bet && (
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center leading-none"
          >
            <CurrencyIcon currency="P_CASH" className="size-6 self-center" />
          </span>
        )}
        {error
          ? t('bet.loadError')
          : !snapshot
            ? t('bet.loading')
            : !bet
              ? t('bet.noBet')
              : t(
                  bet.status === 'WON'
                    ? 'bet.resultWon'
                    : bet.status === 'LOST'
                      ? 'bet.resultLost'
                      : bet.status === 'REFUNDED'
                        ? 'bet.resultRefunded'
                        : 'bet.resultPending',
                  { amount: bet.payout === null ? '—' : money(bet.payout), stake: money(bet.stake) }
                )}
      </p>
      {bet && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-none text-neutral-200">
          {(
            [
              ['bet.stakeLabel', bet.stake],
              ['bet.grossLabel', bet.status === 'WON' ? bet.stake * 2 : 0],
              ['bet.feeLabel', bet.status === 'WON' ? partner + platform : 0]
            ] as const
          ).map(([label, amount], index) => (
            <span key={label} className="inline-flex items-center gap-1">
              {index > 0 && (
                <span aria-hidden="true" className="mr-1">
                  ·
                </span>
              )}
              <span className="translate-y-px">{t(label)}</span>
              <CurrencyAmount
                currency="P_CASH"
                amount={amount}
                locale={language}
                showTooltip={false}
                className="gap-1 leading-none"
                iconClassName="size-3.5"
                amountClassName="translate-y-px"
              />
            </span>
          ))}
        </div>
      )}
      {error && onRetry && (
        <Button variant="ghost" className="mt-2 h-7 rounded-none" onClick={onRetry}>
          {t('bet.retry')}
        </Button>
      )}
    </section>
  )
}

export function PCashBetResult({
  matchId,
  mode,
  className
}: {
  matchId: string
  mode: string
  className?: string
}): React.JSX.Element | null {
  const ownerId = useAuthStore((state) => state.session?.player.id)
  const state = usePCashBetsStore()
  const eligible = (PCASH_BET_MODES as readonly string[]).includes(mode)
  useEffect(() => {
    if (!eligible) return
    void state.load(matchId)
    const timer = window.setInterval(() => {
      const current = usePCashBetsStore.getState()
      if (!current.snapshot || current.snapshot.bet?.status === 'PENDING' || current.error)
        void current.load(matchId)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [eligible, matchId, ownerId, state.load])
  if (!eligible) return null
  const same = state.matchId === matchId && state.ownerId === ownerId
  const snapshot = same ? state.snapshot : null
  // Default players and members of betting-disabled communities must never
  // see any betting UI, so the card stays hidden until a loaded snapshot
  // proves the player can bet or already placed a stake for this match.
  if (!snapshot || (!snapshot.enabled && !snapshot.bet)) return null
  // A queued stake is never presented as winnings before the server settles it.
  return (
    <PCashBetResultView
      snapshot={snapshot}
      error={same && state.error}
      onRetry={() => void state.load(matchId, true)}
      className={className}
    />
  )
}
