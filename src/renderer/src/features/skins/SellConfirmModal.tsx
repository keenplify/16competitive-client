import translations from './refund-translations.json'
import { useTranslation } from '../i18n/i18n'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { type JSX } from 'react'
import { X, TicketSlash, LoaderCircle } from 'lucide-react'
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
  const { language } = useTranslation()
  const text = translations[language]
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
              {text.confirm}
            </p>
            <h2 id="sell-confirm-title" className="mt-1 text-xl font-semibold text-white">
              {text.title.replace('{{name}}', skinName)}
            </h2>
          </div>
          <Button
            className="size-9 px-0"
            variant="ghost"
            aria-label={text.close}
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="space-y-4 p-5 text-sm text-neutral-300">
          <p>{text.description}</p>
          <div className="space-y-3 border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <span>{text.price}</span>
              <CurrencyAmount
                currency={quote.currency}
                amount={quote.purchasePrice}
                showTooltip={false}
              />
            </div>
            <div className="flex items-center justify-between gap-3 font-semibold text-white">
              <span>{text.receive}</span>
              <CurrencyAmount currency={quote.currency} amount={quote.payout} showTooltip={false} />
            </div>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {text.cancel}
          </Button>
          <Button variant="primary" disabled={busy} onClick={onConfirm}>
            {busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <TicketSlash className="mr-2 size-4" />}
            {text.refund}
          </Button>
        </footer>
      </ModalDialog>
    </>
  )
}
