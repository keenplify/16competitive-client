import { useEffect, type JSX } from 'react'
import { ExternalLink, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { usePaymentsStore } from './payments.store'
import { PCASH_PER_USDT } from '../../../../shared/payments'

export function PCashTopUpButton({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const open = usePaymentsStore((state) => state.open)
  const toggle = usePaymentsStore((state) => state.toggle)
  return (
    <Button
      variant="secondary"
      className={twMerge('rounded-none', className)}
      aria-expanded={open}
      aria-controls="p-cash-top-up"
      onClick={toggle}
    >
      <Plus className="mr-2 size-4" aria-hidden="true" />
      {t('payments.title')}
    </Button>
  )
}

export function PCashTopUpPanel({ className }: { className?: string }): JSX.Element | null {
  const { t, language } = useTranslation()
  const ownerId = useAuthStore((state) => state.session?.player.id ?? null)
  const { open, amount, snapshot, busy, error, initialize, setAmount, load, create } =
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
    <section
      id="p-cash-top-up"
      aria-labelledby="p-cash-top-up-title"
      className={twMerge(
        'mt-6 grid gap-6 rounded-none border border-white/15 bg-neutral-950 p-5 lg:grid-cols-[minmax(220px,1fr)_2fr]',
        className
      )}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
        className="min-w-0 space-y-4"
      >
        <div>
          <h2 id="p-cash-top-up-title" className="text-xl font-semibold">
            {t('payments.title')}
          </h2>
          <p className="mt-2 text-sm text-neutral-300">{t('payments.rate')}</p>
          <p className="mt-2 text-sm text-neutral-400">{t('payments.help')}</p>
        </div>
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
        <div className="min-h-24 text-sm" role="status" aria-live="polite">
          {error ? (
            <p className="text-rose-300">{t('payments.error')}</p>
          ) : snapshot && !snapshot.enabled ? (
            <p className="text-neutral-300">{t('payments.unavailable')}</p>
          ) : busy ? (
            <p className="text-neutral-300">{t('payments.loading')}</p>
          ) : null}
        </div>
      </form>
      <div className="min-w-0">
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
        <div className="mt-3 h-80 overflow-y-auto" aria-busy={busy}>
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
    </section>
  )
}
