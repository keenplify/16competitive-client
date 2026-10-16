import type { JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useTranslation } from '../i18n/i18n'
import { usePaymentsStore } from './payments.store'
import type { ManualOrder } from '../../../../shared/payments'

export function ManualTransfer({ order }: { order: ManualOrder }): JSX.Element {
  const { t, language } = useTranslation()
  const { busy, senderName, reference, setTransferDetails, manualAction } = usePaymentsStore()
  const amount = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: order.method.currency
  }).format(order.transferMinor / 100)
  return (
    <section className="space-y-4" aria-label={t('payments.transfer')}>
      <div>
        <h3 className="text-lg font-semibold">
          {order.method.name} · {amount}
        </h3>
        <p className="text-sm text-neutral-300">
          {t('payments.usdQuantity', {
            amount: order.pCashAmount.toLocaleString(language),
            usdt: order.amount.toLocaleString(language)
          })}
        </p>
      </div>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-neutral-400">{t('payments.recipient')}</dt>
          <dd className="break-words select-text">{order.method.accountName}</dd>
        </div>
        <div>
          <dt className="text-neutral-400">{t('payments.account')}</dt>
          <dd className="break-all select-text">{order.method.accountNumber}</dd>
        </div>
      </dl>
      {order.method.qrImage && (
        <figure>
          <div className="flex h-56 items-center justify-center bg-white p-3">
            <img
              src={order.method.qrImage}
              width={200}
              height={200}
              className="h-full max-w-full object-contain"
              alt={t('payments.qr', { method: order.method.name })}
            />
          </div>
          <figcaption className="mt-2 text-xs text-neutral-400">{t('payments.scan')}</figcaption>
        </figure>
      )}
      {order.method.instructions && (
        <p className="text-sm whitespace-pre-wrap break-words text-neutral-300">
          {order.method.instructions}
        </p>
      )}
      <p className="text-sm text-amber-200">{t('payments.manualHelp')}</p>
      <div className="min-h-72">
        {order.status === 'AWAITING_TRANSFER' ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void manualAction('submit')
            }}
          >
            <TextField
              label={t('payments.sender')}
              value={senderName}
              onChange={(e) => setTransferDetails('senderName', e.target.value)}
              maxLength={120}
              required
              disabled={busy}
            />
            <TextField
              label={t('payments.reference')}
              value={reference}
              onChange={(e) => setTransferDetails('reference', e.target.value)}
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
          <div role="status" className="space-y-2 text-sm">
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
      <p className="text-xs text-neutral-400 break-all">
        {t('payments.order')}: {order.id}
      </p>
    </section>
  )
}
