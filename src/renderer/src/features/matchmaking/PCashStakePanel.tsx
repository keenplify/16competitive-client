import { CurrencyAmount } from '../../components/CurrencyIcon'
import { useEffect } from 'react'
import { LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import {
  betPayout,
  PCASH_BET_STAKES,
  PCASH_BET_MODES,
  type PCashBetSnapshot
} from '../../../../shared/pcash-bets'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { usePCashBetsStore } from './pcash-bets.store'

export function PCashStakeView({
  snapshot,
  amount,
  busy,
  error,
  disabled,
  onAmount,
  onRetry,
  className
}: {
  snapshot: PCashBetSnapshot | null
  amount: string
  busy: boolean
  error: boolean
  disabled: boolean
  onAmount: (value: string) => void
  onRetry: () => void
  className?: string
}): React.JSX.Element {
  const { t, language } = useTranslation()
  const stake = Number(amount)
  const valid = (PCASH_BET_STAKES as readonly number[]).includes(stake)
  const payout =
    snapshot && valid
      ? betPayout({ stake, partnerBps: snapshot.partnerBps, platformBps: snapshot.platformBps })
      : null
  return (
    <section
      aria-label={t('bet.title')}
      className={twMerge(
        'h-56 overflow-y-auto border border-white/20 bg-black/40 p-3 text-left text-white sm:h-44',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('bet.title')}</h2>
        <span className="text-xs tabular-nums text-neutral-200">
          {snapshot
            ? t('bet.balance', { amount: snapshot.balance.toLocaleString(language) })
            : t('bet.loading')}
        </span>
      </div>
      {snapshot?.enabled || snapshot?.bet ? (
        <>
          <div
            className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6"
            role="group"
            aria-label={t('bet.amount')}
          >
            <Button
              variant="ghost"
              className={twMerge(
                'h-11 min-w-0 whitespace-nowrap rounded-none border border-white/30 px-1 text-xs',
                stake === 0 && 'border-amber-200 bg-amber-200/15 text-amber-100'
              )}
              aria-pressed={stake === 0}
              disabled={disabled || busy || !snapshot.open || !!snapshot.bet}
              onClick={() => onAmount('0')}
            >
              {t('bet.noBetOption')}
            </Button>
            {PCASH_BET_STAKES.map((value) => (
              <Button
                key={value}
                variant="ghost"
                className={twMerge(
                  'relative h-11 min-w-0 gap-1 rounded-none border border-white/30 px-1 text-sm tabular-nums',
                  stake === value && 'border-amber-200 bg-amber-200/15 text-amber-100'
                )}
                aria-pressed={stake === value}
                aria-label={t('bet.preset', { amount: value })}
                disabled={
                  disabled || busy || !snapshot.open || !!snapshot.bet || value > snapshot.balance
                }
                onClick={() => onAmount(String(value))}
              >
                <CurrencyAmount
                  currency="P_CASH"
                  amount={value}
                  showTooltip={false}
                  className={twMerge(
                    'inline-flex items-center gap-1 leading-none',
                    busy && stake === value && 'invisible'
                  )}
                  iconClassName="size-3.5 sm:size-4"
                  amountClassName="translate-y-px"
                  locale={language}
                />
                {busy && stake === value && (
                  <LoaderCircle
                    className="absolute size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold tabular-nums text-amber-200">
            {snapshot.bet
              ? t('bet.placed')
              : stake === 0
                ? t('bet.noBet')
                : t('bet.payout', {
                    amount: payout === null ? '—' : payout.toLocaleString(language)
                  })}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-100">{t('bet.chooseHint')}</p>
        </>
      ) : (
        <div
          className="flex h-40 flex-col justify-center gap-3 text-sm text-neutral-200"
          role="status"
        >
          <p>{t(error ? 'bet.loadError' : snapshot ? 'bet.unavailable' : 'bet.loading')}</p>
          {error && (
            <Button variant="ghost" className="h-8 w-28 rounded-none" onClick={onRetry}>
              {t('bet.retry')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

export function PCashStakePanel({
  matchId,
  mode,
  disabled,
  className
}: {
  matchId: string
  mode: string
  disabled: boolean
  className?: string
}): React.JSX.Element | null {
  const ownerId = useAuthStore((state) => state.session?.player.id)
  const state = usePCashBetsStore()
  const eligible = (PCASH_BET_MODES as readonly string[]).includes(mode)
  useEffect(() => {
    if (!eligible) return
    void state.load(matchId)
    const timer = window.setInterval(() => void usePCashBetsStore.getState().load(matchId), 3000)
    return () => window.clearInterval(timer)
  }, [eligible, matchId, ownerId, state.load])
  if (!eligible) return null
  const same = state.matchId === matchId && state.ownerId === ownerId
  return (
    <PCashStakeView
      snapshot={same ? state.snapshot : null}
      amount={state.amount}
      busy={state.busy}
      error={same && state.error}
      disabled={disabled}
      onAmount={state.setAmount}
      onRetry={() => void state.load(matchId, true)}
      className={className}
    />
  )
}
