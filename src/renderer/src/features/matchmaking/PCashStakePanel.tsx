import { TopUpNow } from '../skins/TopUpNow'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import {
  betPayout,
  PCASH_BET_STAKES,
  PCASH_BET_MODES,
  type PCashBetSnapshot
} from '../../../../shared/pcash-bets'
import {
  formatLocalMinor,
  formatPCash,
  formatPCashPair,
  localMinorToPcash
} from '../../../../shared/community-currency'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { usePCashBetsStore } from './pcash-bets.store'

/** Mirrors the backend gate: presets or custom amounts when configured. */
function stakeAllowed(snapshot: PCashBetSnapshot | null, stake: number): boolean {
  if (!snapshot) return false
  if (stake < 1) return false
  const currency = snapshot.currency
  if (!currency) return (PCASH_BET_STAKES as readonly number[]).includes(stake)
  if (currency.presets.length > 0)
    return currency.custom.enabled || currency.presets.some((preset) => preset.pcash === stake)
  return currency.custom.enabled || (PCASH_BET_STAKES as readonly number[]).includes(stake)
}

function CustomStakeInput({
  snapshot,
  disabled,
  busy,
  onAmount,
  language
}: {
  snapshot: PCashBetSnapshot
  disabled: boolean
  busy: boolean
  onAmount: (value: string) => void
  language: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const currency = snapshot.currency
  const [text, setText] = useState('')
  const minor = Math.round(Number(text) * 100)
  const pcash =
    Number.isFinite(minor) && minor >= 1 && currency
      ? localMinorToPcash(minor, currency.localPerPcashMicros)
      : 0
  const valid =
    !!currency &&
    pcash >= 1 &&
    pcash <= 1_000_000 &&
    pcash <= snapshot.balance &&
    Number.isFinite(minor)
  const preview = valid && currency ? formatPCashPair(pcash, currency, language) : null
  if (!currency) return <></>
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-neutral-200">
      <span className="shrink-0">{t('bet.customAmount')}</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="text-sm">{currency.symbol}</span>
        <input
          type="number"
          min={0.01}
          step={0.01}
          inputMode="decimal"
          value={text}
          disabled={disabled || busy || !snapshot.open || !!snapshot.bet}
          placeholder={t('bet.customPlaceholder')}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            const nextMinor = Math.round(Number(next) * 100)
            const nextPcash =
              Number.isFinite(nextMinor) && nextMinor >= 1
                ? localMinorToPcash(nextMinor, currency.localPerPcashMicros)
                : 0
            onAmount(
              nextPcash >= 1 && nextPcash <= 1_000_000 && nextPcash <= snapshot.balance
                ? String(nextPcash)
                : '0'
            )
          }}
          className="h-8 w-28 border border-white/30 bg-black/40 px-2 text-sm tabular-nums text-white outline-none focus:border-amber-200"
          aria-label={t('bet.customAmount')}
        />
      </span>
      <span className="tabular-nums text-neutral-300">
        {preview ? t('bet.pcashValue', { amount: formatPCash(pcash, language) }) : '—'}
      </span>
    </label>
  )
}

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
  const currency = snapshot?.currency ?? null
  const localized = !!currency && (currency.presets.length > 0 || currency.custom.enabled)
  const valid = stakeAllowed(snapshot, stake)
  const payout =
    snapshot && valid
      ? betPayout({ stake, partnerBps: snapshot.partnerBps, platformBps: snapshot.platformBps })
      : null
  const balanceText =
    snapshot && currency?.prioritizeLocal
      ? formatPCashPair(snapshot.balance, currency, language)
      : null
  const payoutText =
    payout !== null && currency?.prioritizeLocal
      ? formatPCashPair(payout, currency, language)
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
            ? balanceText
              ? t('bet.balanceLocal', {
                  local: balanceText.primary,
                  pcash: formatPCash(snapshot.balance, language)
                })
              : t('bet.balance', { amount: snapshot.balance.toLocaleString(language) })
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
            {localized
              ? currency.presets.map((preset) => {
                  const tooExpensive = preset.pcash > snapshot.balance
                  return (
                    <Button
                      key={preset.localMinor}
                      variant="ghost"
                      className={twMerge(
                        'relative h-14 min-w-0 gap-1 rounded-none border border-white/30 px-1 text-sm tabular-nums',
                        stake === preset.pcash && 'border-amber-200 bg-amber-200/15 text-amber-100'
                      )}
                      aria-pressed={stake === preset.pcash}
                      aria-label={t('bet.preset', {
                        amount: formatLocalMinor(preset.localMinor, currency.symbol, language)
                      })}
                      disabled={
                        disabled || busy || !snapshot.open || !!snapshot.bet || tooExpensive
                      }
                      onClick={() => onAmount(String(preset.pcash))}
                    >
                      <span className="inline-flex flex-col items-center gap-0.5 leading-none">
                        <span
                          className={twMerge(
                            'text-sm font-semibold',
                            busy && stake === preset.pcash && 'invisible'
                          )}
                        >
                          {formatLocalMinor(preset.localMinor, currency.symbol, language)}
                        </span>
                        <span className="text-[10px] font-normal text-neutral-300">
                          {t('bet.pcashValue', { amount: preset.pcash.toLocaleString(language) })}
                        </span>
                      </span>
                      {busy && stake === preset.pcash && (
                        <LoaderCircle
                          className="absolute size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  )
                })
              : PCASH_BET_STAKES.map((value) => (
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
                      disabled ||
                      busy ||
                      !snapshot.open ||
                      !!snapshot.bet ||
                      value > snapshot.balance
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {localized && currency.custom.enabled && (
              <CustomStakeInput
                snapshot={snapshot}
                disabled={disabled}
                busy={busy}
                onAmount={onAmount}
                language={language}
              />
            )}
            {snapshot.open && !snapshot.bet && <TopUpNow />}
          </div>
          <p className="mt-3 text-sm font-semibold tabular-nums text-amber-200">
            {snapshot.bet
              ? t('bet.placed')
              : stake === 0
                ? t('bet.noBet')
                : payoutText
                  ? t('bet.payoutLocal', {
                      local: payoutText.primary,
                      pcash: formatPCash(payout ?? 0, language)
                    })
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
  if (!eligible || !state.snapshot?.enabled) return null
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
