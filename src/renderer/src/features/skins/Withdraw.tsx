import { useCallback, useEffect, useId, useState, type FormEvent, type JSX } from 'react'
import {
  ArrowUpFromLine,
  ChevronsUp,
  LoaderCircle,
  RefreshCw,
  RotateCcwClock,
  X
} from 'lucide-react'
import { toast } from 'react-toastify'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import type {
  WithdrawalChannel,
  WithdrawalOptions,
  WithdrawalRequest
} from '../../../../shared/withdrawals'

export function WithdrawButton({
  onClick,
  className
}: {
  onClick: () => void
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const tooltipId = useId()
  return (
    <span className="group/withdraw relative inline-flex shrink-0">
      <Button
        variant="ghost"
        className={twMerge(
          'size-11 rounded-none px-0 text-emerald-200 hover:bg-emerald-300/10 hover:text-emerald-100 focus-visible:outline-emerald-300',
          className
        )}
        aria-haspopup="dialog"
        aria-label={t('withdraw.open')}
        aria-describedby={tooltipId}
        onClick={onClick}
      >
        <ArrowUpFromLine className="size-5" aria-hidden="true" />
      </Button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute top-[calc(100%+8px)] right-0 z-50 w-max border border-white/15 bg-neutral-950 px-3 py-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover/withdraw:opacity-100 group-focus-within/withdraw:opacity-100"
      >
        {t('withdraw.open')}
      </span>
    </span>
  )
}

const statusKey = (status: WithdrawalRequest['status']) => `withdraw.status.${status}` as const

function WithdrawalHistory({
  history,
  busy,
  pCashPerUsd,
  onReload,
  onClose
}: {
  history: WithdrawalRequest[]
  busy: boolean
  pCashPerUsd: number
  onReload: () => Promise<void>
  onClose: () => void
}): JSX.Element {
  const { t, language } = useTranslation()
  const number = new Intl.NumberFormat(language)
  return (
    <ModalDialog open onClose={onClose} labelledBy="withdraw-history-title" className="max-w-3xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <RotateCcwClock className="size-6 shrink-0 text-emerald-200" aria-hidden="true" />
          <h2 id="withdraw-history-title" className="text-xl font-semibold">
            {t('withdraw.history')}
          </h2>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            className="size-11 px-0"
            disabled={busy}
            onClick={() => void onReload()}
            aria-label={t('withdraw.reload')}
            title={t('withdraw.reload')}
          >
            {busy ? (
              <LoaderCircle
                className="size-5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw className="size-5" aria-hidden="true" />
            )}
          </Button>
          <Button
            autoFocus
            variant="ghost"
            className="size-11 px-0"
            onClick={onClose}
            aria-label={t('withdraw.closeHistory')}
            title={t('withdraw.closeHistory')}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div className="px-5 py-2 sm:px-6">
        <div className="min-h-80" aria-busy={busy}>
          {busy && history.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-sm text-neutral-300">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              {t('withdraw.loading')}
            </p>
          ) : history.length === 0 ? (
            <p className="py-6 text-sm text-neutral-400">{t('withdraw.empty')}</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {history.map((request) => (
                <li key={request.id} className="py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <p className="text-lg font-semibold tabular-nums">
                        {number.format(Math.floor((request.amountUsdCents * pCashPerUsd) / 100))}{' '}
                        P-Cash
                      </p>
                      <p className="text-sm text-neutral-300">{request.channel}</p>
                      <p className="text-xs break-words text-neutral-400">{request.destination}</p>
                      <p className="text-xs text-neutral-400">
                        {new Date(request.createdAt).toLocaleString(language)}
                      </p>
                    </div>
                    <span
                      className={twMerge(
                        'shrink-0 border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                        request.status === 'PAID'
                          ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                          : request.status === 'CANCELLED'
                            ? 'border-red-300/30 bg-red-300/10 text-red-200'
                            : 'border-amber-300/30 bg-amber-300/10 text-amber-200'
                      )}
                    >
                      {t(statusKey(request.status))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalDialog>
  )
}

export function WithdrawModal({
  open,
  onClose,
  className
}: {
  open: boolean
  onClose: () => void
  className?: string
}): JSX.Element | null {
  const ownerId = useAuthStore((state) => state.session?.player.id ?? null)
  return open && ownerId ? (
    <WithdrawForm key={ownerId} onClose={onClose} className={className} />
  ) : null
}

function WithdrawForm({
  onClose,
  className
}: {
  onClose: () => void
  className?: string
}): JSX.Element {
  const { t, language } = useTranslation()
  const [options, setOptions] = useState<WithdrawalOptions | null>(null)
  const [history, setHistory] = useState<WithdrawalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [channelId, setChannelId] = useState('')
  const [details, setDetails] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState('')

  const showError = useCallback((message: string, toastId = 'withdraw-error') => {
    toast.error(message, { toastId })
  }, [])

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      setHistory(await window.api.skins.withdrawalHistory())
    } catch (caught) {
      showError(
        caught instanceof Error ? caught.message : t('withdraw.unknownError'),
        'withdraw-history-error'
      )
    } finally {
      setHistoryLoading(false)
    }
  }, [showError, t])

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const [nextOptions, nextHistory] = await Promise.all([
          window.api.skins.withdrawalOptions(),
          window.api.skins.withdrawalHistory()
        ])
        if (!active) return
        setOptions(nextOptions)
        setHistory(nextHistory)
        const preferred = nextOptions.account?.channelId ?? nextOptions.channels[0]?.id ?? ''
        setChannelId(preferred)
        setDetails(nextOptions.account?.channelId === preferred ? nextOptions.account.details : {})
      } catch (caught) {
        if (active) showError(caught instanceof Error ? caught.message : t('withdraw.unknownError'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [showError, t])

  const channel: WithdrawalChannel | undefined = options?.channels.find(
    (item) => item.id === channelId
  )
  const number = new Intl.NumberFormat(language)
  const selectChannel = (id: string) => {
    setChannelId(id)
    setDetails(options?.account?.channelId === id ? options.account.details : {})
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!channel || busy) return
    const value = Number(amount)
    if (!Number.isSafeInteger(value) || value < 1) {
      showError(t('withdraw.invalidAmount'))
      return
    }
    const missing = channel.fields.find((field) => field.required && !details[field.key]?.trim())
    if (missing) {
      showError(t('withdraw.fieldRequired', { field: missing.label }))
      return
    }
    setBusy(true)
    try {
      const result = await window.api.skins.createWithdrawal({
        amountPCash: value,
        channelId: channel.id,
        details,
        requestKey: crypto.randomUUID()
      })
      toast.success(t('withdraw.success'))
      setAmount('')
      setOptions((current) =>
        current
          ? { ...current, balancePCash: result.balancePCash, account: result.account }
          : current
      )
      void refreshHistory()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : t('withdraw.error'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <ModalDialog open onClose={onClose} labelledBy="withdraw-title" className={className}>
        <div id="p-cash-withdraw">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center bg-emerald-400/15 text-emerald-300">
                <ArrowUpFromLine className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="withdraw-title" className="text-xl font-semibold">
                  {t('withdraw.title')}
                </h2>
                {options && (
                  <p className="mt-1 text-sm tabular-nums text-emerald-200">
                    {t('withdraw.balance')}: {number.format(options.balancePCash)} P-Cash
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                className="size-11 px-0"
                aria-label={t('withdraw.history')}
                title={t('withdraw.history')}
                aria-haspopup="dialog"
                onClick={() => {
                  setHistoryOpen(true)
                  void refreshHistory()
                }}
              >
                <RotateCcwClock className="size-5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                className="size-11 px-0"
                aria-label={t('withdraw.close')}
                title={t('withdraw.close')}
                onClick={onClose}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
          </header>
          <div className="space-y-5 p-5 sm:p-6">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-neutral-300">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {t('withdraw.loading')}
              </p>
            ) : !options?.enabled ? (
              <p className="border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {t('withdraw.disabled')}
              </p>
            ) : options.channels.length === 0 ? (
              <p className="border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {t('withdraw.noChannels')}
              </p>
            ) : (
              <form onSubmit={(event) => void submit(event)} className="space-y-4">
                <div className="grid gap-2 text-sm font-medium">
                  <label htmlFor="withdraw-channel">{t('withdraw.channel')}</label>
                  <div className="flex items-center gap-2">
                    {channel?.iconDataUrl && (
                      <img
                        src={channel.iconDataUrl}
                        alt=""
                        className="size-11 shrink-0 border border-white/10 bg-neutral-950 object-contain"
                      />
                    )}
                    <select
                      id="withdraw-channel"
                      className="h-11 min-w-0 flex-1 rounded-none border border-white/15 bg-neutral-950 px-3 text-white"
                      value={channelId}
                      disabled={busy}
                      onChange={(event) => selectChannel(event.target.value)}
                    >
                      {options.channels.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {channel?.instructions && (
                    <p className="text-xs font-normal whitespace-pre-wrap text-neutral-400">
                      {channel.instructions}
                    </p>
                  )}
                </div>
                {channel?.fields.map((field) => (
                  <TextField
                    key={field.key}
                    id={`withdraw-field-${field.key}`}
                    label={field.label}
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                    required={field.required}
                    disabled={busy}
                    value={details[field.key] ?? ''}
                    onChange={(event) =>
                      setDetails((current) => ({
                        ...current,
                        [field.key]: event.target.value
                      }))
                    }
                  />
                ))}
                <div className="grid gap-2">
                  <label htmlFor="withdraw-amount" className="text-sm font-medium text-neutral-200">
                    {t('withdraw.amount')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="withdraw-amount"
                      type="number"
                      min={1}
                      max={2_147_483_647}
                      step={1}
                      inputMode="numeric"
                      required
                      disabled={busy}
                      value={amount}
                      className="h-11 min-w-0 flex-1 border border-white/10 bg-neutral-950/70 px-3 text-sm text-white outline-none transition placeholder:text-neutral-400 focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/10 disabled:cursor-not-allowed"
                      onChange={(event) => setAmount(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 shrink-0 gap-2 px-3 text-emerald-300"
                      disabled={busy || (options.balancePCash ?? 0) <= 0}
                      onClick={() => setAmount(String(Math.max(0, options.balancePCash ?? 0)))}
                    >
                      <ChevronsUp className="size-5" aria-hidden="true" />
                      {t('withdraw.all')}
                    </Button>
                  </div>
                  <span className="text-xs text-neutral-400">{t('withdraw.amountHelp')}</span>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={busy || !channel}
                >
                  {busy ? t('withdraw.submitting') : t('withdraw.submit')}
                </Button>
              </form>
            )}
          </div>
        </div>
      </ModalDialog>
      {historyOpen && (
        <WithdrawalHistory
          history={history}
          busy={historyLoading}
          pCashPerUsd={options?.pCashPerUsd ?? 100}
          onReload={refreshHistory}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  )
}
