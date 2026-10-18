import { ModalDialog } from '../../components/ui/ModalDialog'
import { type JSX } from 'react'
import { X } from 'lucide-react'
import type { SkinResaleQuote } from '../../../../shared/skins'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { Button } from '../../components/ui/Button'

export function SellConfirmModal({
  skinName,
  quote,
  busy,
  onClose,
  onConfirm
}: {
  skinName: string
  quote: SkinResaleQuote
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <>
      <ModalDialog
        open
        onClose={() => {
          if (!busy) onClose()
        }}
        className="w-[calc(100%-2rem)] max-w-md border border-white/15 bg-neutral-950 shadow-2xl"
        labelledBy="sell-confirm-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.18em] text-sky-300 uppercase">
              Confirm sale
            </p>
            <h2 id="sell-confirm-title" className="mt-1 text-xl font-semibold text-white">
              Sell {skinName}?
            </h2>
          </div>
          <Button
            className="size-9 px-0"
            variant="ghost"
            aria-label="Close sale confirmation"
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="space-y-4 p-5 text-sm text-neutral-300">
          <p>Are you sure you want to sell this skin? It will be removed from your inventory.</p>
          <div className="space-y-3 border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <span>Price used</span>
              <CurrencyAmount
                currency={quote.currency}
                amount={quote.purchasePrice}
                showTooltip={false}
              />
            </div>
            <div className="flex items-center justify-between gap-3 font-semibold text-white">
              <span>You receive (65%)</span>
              <CurrencyAmount currency={quote.currency} amount={quote.payout} showTooltip={false} />
            </div>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Selling…' : 'Sell skin'}
          </Button>
        </footer>
      </ModalDialog>
    </>
  )
}
