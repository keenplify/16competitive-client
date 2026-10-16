import type { JSX } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useTranslation } from '../i18n/i18n'
import { usePaymentsStore } from './payments.store'
import type { ManualOrder } from '../../../../shared/payments'

export function ManualTransferPopup({ order }: { order: ManualOrder }): JSX.Element {
  const { t, language } = useTranslation()
  const { busy, error, senderName, reference, setTransferDetails, manualAction, closeDetails } =
    usePaymentsStore()
  const amount = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: order.method.currency
  }).format(order.transferMinor / 100)
  return (
    <ModalDialog
      open
      onClose={closeDetails}
      labelledBy="manual-payment-summary"
      className="max-w-3xl"
    >
      <div className="space-y-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="manual-payment-summary" className="text-xl font-semibold">
              {order.method.name} · {amount}
            </h2>
            <p className="mt-1 text-sm text-neutral-300">
              {t('payments.usdQuantity', {
                amount: order.pCashAmount.toLocaleString(language),
                usdt: order.amount.toLocaleString(language)
              })}
            </p>
          </div>
          <Button
            autoFocus
            variant="ghost"
            className="size-11 shrink-0 px-0"
            aria-label={t('payments.closeDetails')}
            title={t('payments.closeDetails')}
            onClick={closeDetails}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </header>
        <dl className="grid grid-cols-2 gap-4 border-y border-white/10 py-4 text-sm">
          <div className="min-w-0">
            <dt className="text-neutral-400">{t('payments.recipient')}</dt>
            <dd className="mt-1 break-words select-text">{order.method.accountName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-neutral-400">{t('payments.account')}</dt>
            <dd className="mt-1 break-all select-text">{order.method.accountNumber}</dd>
          </div>
        </dl>
        <div
          className={
            order.method.qrImage
              ? 'grid gap-6 sm:grid-cols-[minmax(0,256px)_minmax(0,1fr)]'
              : 'min-w-0'
          }
        >
          {order.method.qrImage && (
            <figure className="min-w-0">
              <div className="mx-auto flex size-64 max-w-full items-center justify-center bg-white p-3">
                <img
                  src={order.method.qrImage}
                  width={232}
                  height={232}
                  className="h-full max-w-full object-contain"
                  alt={t('payments.qr', { method: order.method.name })}
                />
              </div>
              <figcaption className="mt-3 text-xs leading-5 text-neutral-400">
                {t('payments.scan')}
              </figcaption>
            </figure>
          )}
          <div className="min-w-0 space-y-4">
            {order.method.instructions && (
              <p className="text-sm whitespace-pre-wrap break-words text-neutral-300">
                {order.method.instructions}
              </p>
            )}
            <p className="text-sm leading-5 text-amber-200">{t('payments.manualHelp')}</p>
            <div className="min-h-72">
              {order.status === 'AWAITING_TRANSFER' ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void manualAction('submit')
                  }}
                >
                  <TextField
                    label={t('payments.sender')}
                    value={senderName}
                    onChange={(event) => setTransferDetails('senderName', event.target.value)}
                    maxLength={120}
                    required
                    disabled={busy}
                  />
                  <TextField
                    label={t('payments.reference')}
                    value={reference}
                    onChange={(event) => setTransferDetails('reference', event.target.value)}
                    minLength={3}
                    maxLength={120}
                    required
                    disabled={busy}
                  />
                  <Button
                    type="submit"
                    className="min-h-11 w-full"
                    disabled={busy || !senderName.trim() || reference.trim().length < 3}
                  >
                    {t('payments.sent')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 w-full"
                    disabled={busy}
                    onClick={() => void manualAction('cancel')}
                  >
                    {t('payments.cancelTransfer')}
                  </Button>
                </form>
              ) : (
                <div role="status" className="space-y-3 text-sm">
                  <p>{t(`payments.manual.${order.status}`)}</p>
                  {order.reference && (
                    <p className="break-all">
                      {t('payments.reference')}: {order.reference}
                    </p>
                  )}
                  {order.reviewNote && (
                    <p className="whitespace-pre-wrap break-words">{order.reviewNote}</p>
                  )}
                </div>
              )}
            </div>
            <div className="h-16 overflow-y-auto text-sm text-rose-300" role="status">
              {error && t('payments.manualError')}
            </div>
          </div>
        </div>
      </div>
    </ModalDialog>
  )
}
