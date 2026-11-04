import { LoaderCircle, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { useInventoryStore } from './inventory.store'
import { useInventoryText } from './inventory-i18n'

export function StickerPurchaseDialog() {
  const purchase = useInventoryStore((s) => s.purchase)
  const pending = useInventoryStore((s) => s.pending)
  const images = useInventoryStore((s) => s.images)
  const t = useInventoryText()
  if (!purchase) return null
  const { item, attempted, input } = purchase
  // An uncertain request must retry the original price/currency and request ID.
  const free = attempted
    ? input.expectedPrice === 0
    : item.pricePoints === 0 || item.pricePCash === 0
  const close = () => useInventoryStore.getState().close()
  const buy = (currency?: 'POINTS' | 'P_CASH') => {
    if (useInventoryStore.getState().pending) return
    if (!attempted) useInventoryStore.getState().selectPurchase(item, currency)
    void useInventoryStore.getState().buy()
  }
  return (
    <ModalDialog
      open
      onClose={close}
      label={t(free ? 'claim' : 'buy')}
      vguiTitlebar={false}
      className="max-w-md"
      contentClassName="p-6"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-neutral-300">{t(free ? 'claim' : 'buy')}</p>
          <h2 className="mt-1 text-xl font-semibold">{item.name}</h2>
        </div>
        <Button
          variant="ghost"
          className="size-9 shrink-0 px-0"
          onClick={close}
          disabled={pending}
          aria-label={t('close')}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="my-4 flex h-64 items-center justify-center">
        {item.imagePath && images[item.imagePath] ? (
          <img
            src={images[item.imagePath]}
            alt={item.name}
            className="h-full w-full object-contain p-3"
            draggable={false}
          />
        ) : (
          <LoaderCircle className="size-7 animate-spin" aria-label={t('pending')} />
        )}
      </div>
      <div className="flex min-h-10 justify-end gap-3">
        {free ? (
          <Button className="relative min-w-32" disabled={pending} onClick={() => buy()}>
            <span className={pending ? 'invisible' : undefined}>{t('claim')}</span>
            {pending && (
              <LoaderCircle className="absolute size-4 animate-spin" aria-hidden="true" />
            )}
          </Button>
        ) : (
          (['POINTS', 'P_CASH'] as const).map((currency) => {
            if (attempted && currency !== input.currency) return null
            const price = attempted
              ? input.expectedPrice
              : currency === 'POINTS'
                ? item.pricePoints
                : item.pricePCash
            if (price === null) return null
            return (
              <Button
                key={currency}
                className="relative min-w-24"
                disabled={pending}
                onClick={() => buy(currency)}
                aria-label={`${t('buy')} — ${currency === 'POINTS' ? t('points') : t('pCash')} ${price}`}
              >
                <span className={pending && input.currency === currency ? 'invisible' : undefined}>
                  <CurrencyAmount currency={currency} amount={price} showTooltip={false} />
                </span>
                {pending && input.currency === currency && (
                  <LoaderCircle className="absolute size-4 animate-spin" aria-hidden="true" />
                )}
              </Button>
            )
          })
        )}
      </div>
    </ModalDialog>
  )
}
