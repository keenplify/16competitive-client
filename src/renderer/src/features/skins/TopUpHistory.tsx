import type { JSX } from 'react'
import { ExternalLink, LoaderCircle, RefreshCw, RotateCcwClock, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { usePaymentsStore } from './payments.store'

export function TopUpHistory(): JSX.Element {
  const { t, language } = useTranslation()
  const { snapshot, busy, error, hideHistory, load, resumeManual } = usePaymentsStore()
  const entries = [
    ...(snapshot?.orders ?? []).map((order) => ({ kind: 'paymento' as const, order })),
    ...(snapshot?.manual?.orders ?? []).map((order) => ({ kind: 'manual' as const, order }))
  ].sort((a, b) => Date.parse(b.order.createdAt) - Date.parse(a.order.createdAt))
  return (
    <ModalDialog open onClose={hideHistory} labelledBy="p-cash-history-title" className="max-w-3xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <RotateCcwClock className="size-6 shrink-0 text-amber-200" aria-hidden="true" />
          <h2 id="p-cash-history-title" className="text-xl font-semibold">
            {t('payments.history')}
          </h2>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            className="size-11 px-0"
            disabled={busy}
            onClick={() => void load()}
            aria-label={t('payments.reload')}
            title={t('payments.reload')}
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
            onClick={hideHistory}
            aria-label={t('payments.closeHistory')}
            title={t('payments.closeHistory')}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div className="px-5 py-2 sm:px-6">
        <div className="min-h-80" aria-busy={busy}>
          {!snapshot ? (
            <p className="py-6 text-sm text-neutral-300">{t('payments.loading')}</p>
          ) : !entries.length ? (
            <p className="py-6 text-sm text-neutral-400">{t('payments.empty')}</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {entries.map((entry) => (
                <li key={entry.order.id} className="py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <p className="text-lg font-semibold tabular-nums">
                        {entry.order.pCashAmount.toLocaleString(language)} P-Cash
                      </p>
                      <p className="text-sm text-neutral-300">
                        {entry.kind === 'paymento'
                          ? `${entry.order.amount.toLocaleString(language)} USDT · Paymento`
                          : `${new Intl.NumberFormat(language, { style: 'currency', currency: entry.order.method.currency }).format(entry.order.transferMinor / 100)} · ${entry.order.method.name}`}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {new Date(entry.order.createdAt).toLocaleString(language)}
                      </p>
                      <p
                        className={twMerge(
                          'pt-1 text-sm text-neutral-300',
                          (entry.order.status === 'CREDITED' ||
                            entry.order.status === 'APPROVED') &&
                            'text-emerald-300'
                        )}
                      >
                        {entry.kind === 'paymento'
                          ? t(`payments.status.${entry.order.status}`)
                          : t(`payments.manual.${entry.order.status}`)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {entry.kind === 'manual' ? (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => resumeManual(entry.order.id)}
                        >
                          {t('payments.details')}
                        </Button>
                      ) : (
                        <>
                          {entry.order.checkoutUrl && (
                            <a
                              href={entry.order.checkoutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 items-center gap-2 border border-amber-300/40 px-3 text-sm font-medium text-amber-200 hover:bg-amber-300/10 focus-visible:outline-2 focus-visible:outline-amber-300"
                            >
                              {t('payments.checkout')}
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                          )}
                          {entry.order.status !== 'CREDITED' && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void load(entry.order.id)}
                            >
                              {t('payments.check')}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="h-16 overflow-y-auto text-sm text-rose-300" role="status">
          {error && t('payments.error')}
        </div>
      </div>
    </ModalDialog>
  )
}
