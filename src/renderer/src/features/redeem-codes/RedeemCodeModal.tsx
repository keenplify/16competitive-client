import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import { CheckCircle2, LoaderCircle, Ticket, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import type { RedeemCodeResult } from '../../../../shared/redeem-codes'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { ensureStickerArtwork, useInventoryStore } from '../inventory/inventory.store'
import translations from './redeem-translations.json'

export function RedeemCodeModal({ onClose, onRedeemed }: { onClose: () => void; onRedeemed: () => void | Promise<void> }): JSX.Element {
  const { language } = useTranslation()
  const text = translations[language]
  const input = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RedeemCodeResult | null>(null)
  const artwork = useInventoryStore(state => result?.sticker ? state.images[result.sticker.imagePath] : undefined)
  useEffect(() => {
    if (result?.sticker) void ensureStickerArtwork(result.sticker.imagePath).catch(() => undefined)
  }, [result])
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (pending || !code.trim()) return
    setPending(true); setError(null)
    const feedback = toast.loading(text.pending)
    void window.api.redeemCodes.redeem(code.trim()).then(async response => {
      if (!response.ok) throw new Error(response.error)
      useAuthStore.getState().setPoints(response.result.points)
      setResult(response.result)
      toast.update(feedback, { render: text.success, type: 'success', isLoading: false, autoClose: 4000 })
      await Promise.allSettled([useAuthStore.getState().refreshSession(), useInventoryStore.getState().load(), Promise.resolve().then(onRedeemed)])
    }).catch(() => {
      setError(text.failed)
      toast.update(feedback, { render: text.failed, type: 'error', isLoading: false, autoClose: 6000 })
    }).finally(() => setPending(false))
  }
  return <ModalDialog open vguiTitlebar={false} initialFocusRef={input} onClose={() => { if (!pending) onClose() }} className="max-w-md border-white/10 bg-neutral-900 p-6 shadow-2xl" labelledBy="redeem-code-title">
    <header className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3"><Ticket className="size-6 shrink-0 text-amber-300" /><div><h2 id="redeem-code-title" className="text-xl font-semibold">{text.title}</h2><p className="mt-1 text-sm text-neutral-400">{text.description}</p></div></div>
      <Button variant="ghost" className="size-9 shrink-0 px-0" aria-label={text.cancel} disabled={pending} onClick={onClose}><X className="size-4" /></Button>
    </header>
    <div className="mt-6 min-h-56">
      {result ? <div>
        <div className="space-y-3 border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-200"><CheckCircle2 className="size-5" />{text.success}</p>
          {result.pointsGranted > 0 && <CurrencyAmount currency="POINTS" amount={result.pointsGranted} />}
          {(result.pCashGranted ?? 0) > 0 && <CurrencyAmount currency="P_CASH" amount={result.pCashGranted!} />}
          {result.skinId && <p>{result.skinName ?? text.skin}{!result.skinGranted && ` · ${text.owned}`}</p>}
          {(result.stickersGranted ?? 0) > 0 && <div className="flex items-center gap-3"><div className="flex size-16 shrink-0 items-center justify-center">{artwork && <img className="size-full object-contain" src={artwork} alt={result.sticker?.name ?? text.sticker} />}</div><span>{result.sticker?.name ?? result.stickerId ?? text.sticker} ×{result.stickersGranted}</span></div>}
        </div>
        <Button className="mt-5 w-full" onClick={onClose}>{text.done}</Button>
      </div> : <form onSubmit={submit}>
        <TextField ref={input} id="redeem-code" label={text.code} value={code} minLength={3} maxLength={64} autoComplete="off" placeholder="WELCOME_2026" className="font-mono uppercase" disabled={pending} onChange={event => { setCode(event.target.value); setError(null) }} />
        <div className="mt-3 h-16 text-sm text-rose-300" aria-live="polite">{error}</div>
        <div className="mt-4 flex justify-end gap-3"><Button variant="ghost" disabled={pending} onClick={onClose}>{text.cancel}</Button><Button type="submit" className="relative min-w-28" disabled={pending || code.trim().length < 3}><span className={pending ? 'invisible' : undefined}>{text.redeem}</span>{pending && <LoaderCircle className="absolute size-4 animate-spin" aria-label={text.pending} />}</Button></div>
      </form>}
    </div>
  </ModalDialog>
}
