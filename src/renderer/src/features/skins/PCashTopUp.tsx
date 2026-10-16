import { useEffect, useId, type JSX } from 'react'
import { ExternalLink, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { usePaymentsStore } from './payments.store'
import { PCASH_PER_USDT } from '../../../../shared/payments'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { CurrencyIcon } from '../../components/CurrencyIcon'

export function PCashTopUpButton({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const open = usePaymentsStore((state) => state.open)
  const toggle = usePaymentsStore((state) => state.toggle)
  const tooltipId = useId()
  return (
    <span className="group/top-up relative inline-flex shrink-0">
      <Button
        variant="ghost"
        className={twMerge(
          'size-11 rounded-none px-0 text-amber-200 hover:bg-amber-300/10 hover:text-amber-100 focus-visible:outline-amber-300',
          className
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('payments.topUp')}
        aria-describedby={tooltipId}
        aria-controls="p-cash-top-up"
        onClick={toggle}
      >
        <Plus className="size-5" aria-hidden="true" />
      </Button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute top-[calc(100%+8px)] right-0 z-50 w-max border border-white/15 bg-neutral-950 px-3 py-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover/top-up:opacity-100 group-focus-within/top-up:opacity-100"
      >
        {t('payments.topUp')}
      </span>
    </span>
  )
}

export function PCashTopUpModal({ className }: { className?: string }): JSX.Element | null {
  const { t, language } = useTranslation()
  const ownerId = useAuthStore((state) => state.session?.player.id ?? null)
  const { open, amount, snapshot, busy, error, initialize, setAmount, load, create, close } =
    usePaymentsStore()
  useEffect(() => {
    initialize(ownerId)
  }, [initialize, ownerId])
  useEffect(() => {
    if (!open || !ownerId) return
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 15_000)
    const onFocus = (): void => {
      void load()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [open, ownerId, load])
  if (!open) return null
  const validAmount = /^\d+$/.test(amount) && Number(amount) >= 1 && Number(amount) <= 10_000
  return (
    <ModalDialog
      open={open}
      onClose={close}
      labelledBy="p-cash-top-up-title"
      describedBy="p-cash-top-up-rate"
      className={className}
    >
      <div id="p-cash-top-up">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <CurrencyIcon currency="P_CASH" className="size-10" />
            <div>
              <h2 id="p-cash-top-up-title" className="text-xl font-semibold">
                {t('payments.title')}
              </h2>
              <p id="p-cash-top-up-rate" className="mt-1 text-sm text-amber-200">
                {t('payments.rate')}
              </p>
            </div>
          </div>
          <Button
            autoFocus
            variant="ghost"
            className="size-11 shrink-0 rounded-none px-0"
            aria-label={t('payments.close')}
            onClick={close}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </header>
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
            className="min-w-0 space-y-4"
          >
            <fieldset disabled={busy}>
              <legend className="mb-2 text-sm font-medium text-neutral-200">
                {t('payments.presets')}
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 50, 100, 200, 300, 400, 500].map((value) => (
                  <Button
                    key={value}
                    variant="secondary"
                    aria-pressed={Number(amount) === value}
                    onClick={() => setAmount(String(value))}
                    className={twMerge(
                      'rounded-none px-2 tabular-nums',
                      Number(amount) === value &&
                        'border-amber-300 bg-amber-300 text-neutral-950 hover:bg-amber-200'
                    )}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </fieldset>
            <TextField
              id="p-cash-amount"
              label={t('payments.amount')}
              type="number"
              min={1}
              max={10000}
              step={1}
              inputMode="numeric"
              value={amount}
              disabled={busy}
              required
              className="rounded-none text-base"
              aria-describedby="p-cash-amount-help"
              onChange={(event) => setAmount(event.target.value)}
            />
            <p id="p-cash-amount-help" className="text-xs text-neutral-400">
              {t('payments.limits')}
            </p>
            <p className="min-h-6 text-sm font-semibold tabular-nums" aria-live="polite">
              {validAmount
                ? t('payments.quantity', {
                    amount: (Number(amount) * PCASH_PER_USDT).toLocaleString(language),
                    usdt: Number(amount).toLocaleString(language)
                  })
                : '—'}
            </p>
            <Button
              type="submit"
              className="w-full rounded-none"
              disabled={busy || !validAmount || !snapshot?.enabled}
            >
              {busy ? (
                <LoaderCircle
                  className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Plus className="mr-2 size-4" aria-hidden="true" />
              )}
              {t('payments.create')}
            </Button>
            <p className="text-sm leading-5 text-neutral-400">{t('payments.help')}</p>
            <div className="h-24 overflow-y-auto text-sm" role="status" aria-live="polite">
              {error ? (
                <p className="text-rose-300">{t('payments.error')}</p>
              ) : snapshot && !snapshot.enabled ? (
                <p className="text-neutral-300">{t('payments.unavailable')}</p>
              ) : busy ? (
                <p className="text-neutral-300">{t('payments.loading')}</p>
              ) : null}
            </div>
          </form>
          <div className="min-w-0 border-t border-white/10 pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <h3 className="font-semibold">{t('payments.recent')}</h3>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void load()}
                aria-label={t('payments.reload')}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-3 h-64 overflow-y-auto sm:h-80" aria-busy={busy}>
              {!snapshot ? (
                <p className="text-sm text-neutral-400">{t('payments.loading')}</p>
              ) : !snapshot.orders.length ? (
                <p className="text-sm text-neutral-400">{t('payments.empty')}</p>
              ) : (
                <ul className="divide-y divide-white/10">
                  {snapshot.orders.map((order) => (
                    <li key={order.id} className="py-4 first:pt-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold tabular-nums">
                            {t('payments.quantity', {
                              amount: order.pCashAmount.toLocaleString(language),
                              usdt: order.amount.toLocaleString(language)
                            })}
                          </p>
                          <p className="mt-1 text-xs text-neutral-400">
                            {new Date(order.createdAt).toLocaleString(language)}
                          </p>
                          <p
                            className={twMerge(
                              'mt-2 text-sm text-neutral-300',
                              order.status === 'CREDITED' && 'text-emerald-300'
                            )}
                          >
                            {t(`payments.status.${order.status}`)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {order.checkoutUrl && (
                            <a
                              href={order.checkoutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 items-center gap-2 border border-amber-300/40 px-3 text-sm text-amber-200 hover:bg-amber-300/10 focus-visible:outline-2 focus-visible:outline-amber-300"
                            >
                              {t('payments.checkout')}
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                          )}
                          {order.status !== 'CREDITED' && (
                            <Button
                              variant="secondary"
                              className="rounded-none"
                              disabled={busy}
                              onClick={() => void load(order.id)}
                            >
                              {t('payments.check')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalDialog>
  )
}
