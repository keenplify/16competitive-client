import { useEffect, useId, type JSX } from 'react'
import { LoaderCircle, Plus, RotateCcwClock, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { usePaymentsStore } from './payments.store'
import { PCASH_PER_USDT, usdFromPCash } from '../../../../shared/payments'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { ManualTransferPopup } from './ManualTopUp'
import { CurrencyIcon } from '../../components/CurrencyIcon'
import { TopUpAmountTile } from './TopUpAmounts'
import { topUpPrice } from './top-up-price'
import { TopUpHistory } from './TopUpHistory'

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
  const {
    open,
    historyOpen,
    customOpen,
    amount,
    snapshot,
    busy,
    error,
    initialize,
    setAmount,
    choosePreset,
    showCustom,
    load,
    create,
    close,
    methodId,
    activeManualId,
    selectMethod,
    manualAction,
    showHistory
  } = usePaymentsStore()
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
  const activeManual = snapshot?.manual?.orders.find((order) => order.id === activeManualId)
  const manualMethod = snapshot?.manual?.methods.find((method) => method.id === methodId)
  const manual = methodId !== 'paymento'
  const usd = usdFromPCash(amount)
  const price =
    usd !== null && (!manual || manualMethod) ? topUpPrice(usd, manualMethod, language) : '—'
  const onClose = close
  return (
    <>
      <ModalDialog
        open
        onClose={onClose}
        labelledBy="p-cash-top-up-title"
        describedBy="p-cash-top-up-rate"
        className={className}
      >
        <div id="p-cash-top-up">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <CurrencyIcon currency="P_CASH" className="size-9" />
              <div>
                <h2 id="p-cash-top-up-title" className="text-xl font-semibold">
                  {t('payments.title')}
                </h2>
                <p id="p-cash-top-up-rate" className="mt-1 text-sm text-amber-200">
                  {t(manual ? 'payments.usdRate' : 'payments.rate')}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                className="size-11 px-0"
                aria-label={t('payments.history')}
                title={t('payments.history')}
                aria-haspopup="dialog"
                onClick={showHistory}
              >
                <RotateCcwClock className="size-5" aria-hidden="true" />
              </Button>
              <Button
                autoFocus
                variant="ghost"
                className="size-11 px-0"
                aria-label={t('payments.close')}
                title={t('payments.close')}
                onClick={onClose}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
          </header>
          <div className="space-y-5 p-5 sm:p-6">
            <label className="grid gap-2 text-sm font-medium">
              {t('payments.method')}
              <select
                className="h-11 w-full rounded-none border border-white/15 bg-neutral-950 px-3 text-white"
                value={methodId}
                disabled={busy}
                onChange={(e) => selectMethod(e.target.value)}
              >
                <option value="paymento">Paymento · USDT</option>
                {snapshot?.manual?.methods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name} · {method.currency}
                  </option>
                ))}
              </select>
            </label>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (manual) void manualAction('create')
                else void create()
              }}
              className="space-y-5"
            >
              <fieldset disabled={busy}>
                <legend className="mb-3 text-base font-medium">{t('payments.pCashPresets')}</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[5, 10, 50, 100, 200, 300, 400, 500].map((value) => {
                    const pCash = value * PCASH_PER_USDT
                    const cost =
                      manual && !manualMethod ? '—' : topUpPrice(value, manualMethod, language)
                    return (
                      <TopUpAmountTile
                        key={value}
                        amount={pCash.toLocaleString(language)}
                        price={cost}
                        selected={!customOpen && Number(amount) === pCash}
                        label={t('payments.option', {
                          amount: pCash.toLocaleString(language),
                          price: cost
                        })}
                        onSelect={() => choosePreset(String(pCash))}
                      />
                    )
                  })}
                </div>
                <Button
                  variant="secondary"
                  className="mt-3 w-full"
                  aria-expanded={customOpen}
                  aria-controls="p-cash-custom"
                  onClick={showCustom}
                >
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                  {t('payments.custom')}
                </Button>
              </fieldset>
              {customOpen && (
                <div id="p-cash-custom" className="space-y-2">
                  <TextField
                    autoFocus
                    id="p-cash-amount"
                    label={t('payments.pCashAmount')}
                    type="number"
                    min={100}
                    max={1000000}
                    step={100}
                    inputMode="numeric"
                    value={amount}
                    disabled={busy}
                    required
                    className="text-lg"
                    aria-describedby="p-cash-amount-help"
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <p id="p-cash-amount-help" className="text-xs text-neutral-400">
                    {t('payments.pCashLimits')}
                  </p>
                </div>
              )}
              <div
                className="flex min-h-16 items-center justify-between gap-4 border-t border-white/10 pt-5 tabular-nums"
                aria-live="polite"
              >
                <span className="inline-flex items-center gap-2">
                  <CurrencyIcon currency="P_CASH" className="size-7" />
                  <span className="text-2xl font-semibold">
                    {usd !== null ? Number(amount).toLocaleString(language) : '—'}
                  </span>
                </span>
                <span className="text-right text-xl font-semibold text-amber-200">{price}</span>
              </div>
              <Button
                type="submit"
                className="h-12 w-full text-base"
                disabled={busy || usd === null || (manual ? !manualMethod : !snapshot?.enabled)}
              >
                {busy ? (
                  <LoaderCircle
                    className="mr-2 size-5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Plus className="mr-2 size-5" aria-hidden="true" />
                )}
                {t(manual ? 'payments.transfer' : 'payments.create')}
              </Button>
              <p className="text-sm leading-5 text-neutral-400">
                {t(manual ? 'payments.manualHelp' : 'payments.help')}
              </p>
              <div className="h-16 overflow-y-auto text-sm" role="status" aria-live="polite">
                {error ? (
                  <p className="text-rose-300">
                    {t(manual ? 'payments.manualError' : 'payments.error')}
                  </p>
                ) : snapshot && !snapshot.enabled && !manual ? (
                  <p className="text-neutral-300">{t('payments.unavailable')}</p>
                ) : busy ? (
                  <p className="text-neutral-300">{t('payments.loading')}</p>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      </ModalDialog>
      {historyOpen && <TopUpHistory />}
      {activeManual && <ManualTransferPopup order={activeManual} />}
    </>
  )
}
