import { ShoppingCart, X } from 'lucide-react'
import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Skin, SkinCurrency } from '../../../../shared/skins'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'

export function PurchaseConfirmModal({
  skin,
  pointsBalance,
  pCashBalance,
  busy = false,
  onClose,
  onConfirm
}: {
  skin: Skin
  pointsBalance: number
  pCashBalance: number
  busy?: boolean
  onClose: () => void
  onConfirm: (currency: SkinCurrency) => void
}): JSX.Element {
  const options = useMemo(
    () => [
      ...(skin.pointsEnabled
        ? [{ currency: 'POINTS' as const, amount: skin.pricePoints, balance: pointsBalance }]
        : []),
      ...(skin.pricePCash !== null
        ? [{ currency: 'P_CASH' as const, amount: skin.pricePCash, balance: pCashBalance }]
        : [])
    ],
    [pCashBalance, pointsBalance, skin.pointsEnabled, skin.pricePCash, skin.pricePoints]
  )
  const [currency, setCurrency] = useState<SkinCurrency>(options[0]?.currency ?? 'POINTS')
  const selected = options.find((option) => option.currency === currency) ?? options[0]
  const canAfford = Boolean(selected && selected.balance >= selected.amount)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(event) => {
          if (event.currentTarget === event.target && !busy) onClose()
        }}
      >
        <section
          className="w-full max-w-md overflow-hidden  border border-white/15 bg-neutral-950 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-confirm-title"
        >
          <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.18em] text-sky-300 uppercase">
                Confirm purchase
              </p>
              <h2 id="purchase-confirm-title" className="mt-1 text-xl font-semibold text-white">
                Purchase {skin.name}?
              </h2>
            </div>
            <Button
              className="size-9 px-0"
              variant="ghost"
              aria-label="Close purchase confirmation"
              disabled={busy}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </header>

          <div className="p-5">
            <p className="text-sm leading-6 text-neutral-300">
              Are you sure you want to purchase this skin?
            </p>

            <div className="mt-5 space-y-2">
              {options.map((option) => {
                const affordable = option.balance >= option.amount
                const active = option.currency === currency
                return (
                  <button
                    key={option.currency}
                    type="button"
                    className={[
                      'flex w-full items-center justify-between  border px-4 py-3 text-left transition',
                      active
                        ? 'border-sky-300/60 bg-sky-300/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20',
                      !affordable ? 'opacity-55' : ''
                    ].join(' ')}
                    disabled={busy}
                    onClick={() => setCurrency(option.currency)}
                  >
                    <CurrencyAmount
                      currency={option.currency}
                      amount={option.amount}
                      className="text-base font-bold text-white"
                      iconClassName="size-7"
                    />
                    <span className="text-xs text-neutral-400">
                      Balance {option.balance.toLocaleString()}
                    </span>
                  </button>
                )
              })}
            </div>

            {!canAfford && selected && (
              <p className="mt-3 text-xs text-rose-300">
                You do not have enough {selected.currency === 'POINTS' ? 'Points' : 'Papa Cash'}.
              </p>
            )}
          </div>

          <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || !selected || !canAfford}
              onClick={() => selected && onConfirm(selected.currency)}
            >
              <ShoppingCart className="mr-2 size-4" aria-hidden="true" />
              {busy ? 'Purchasing…' : 'Purchase'}
            </Button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  )
}
