import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { isWebRuntime } from '../../web-runtime'
import { useTranslation, type TranslationKey } from '../i18n/i18n'
import { useIcafeBranchStore } from './icafe-branch.store'

export function IcafeBranchPanel(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useIcafeBranchStore((state) => state.open)
  const busy = useIcafeBranchStore((state) => state.busy)
  const error = useIcafeBranchStore((state) => state.error)
  const status = useIcafeBranchStore((state) => state.status)
  const toggle = useIcafeBranchStore((state) => state.toggle)
  const close = useIcafeBranchStore((state) => state.close)
  const link = useIcafeBranchStore((state) => state.link)
  const unlink = useIcafeBranchStore((state) => state.unlink)
  const [code, setCode] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const webRuntime = isWebRuntime()

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    if (status.managedExternally) dialogRef.current?.focus()
    else inputRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open, status.managedExternally])

  useEffect(() => {
    if (webRuntime) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.code === 'KeyI') {
        event.preventDefault()
        toggle()
      } else if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, toggle, webRuntime])

  if (webRuntime || !open) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (/^\d{6}$/.test(code))
      void link(code).then(() => {
        if (useIcafeBranchStore.getState().status.info) setCode('')
      })
  }
  const errorKey: TranslationKey = error?.includes('ICAFE_MANAGED_EXTERNALLY')
    ? 'icafe.managedExternally'
    : error?.includes('ICAFE_SECURE_STORAGE_UNAVAILABLE')
      ? 'icafe.secureStorageUnavailable'
      : error?.includes('ICAFE_TOO_MANY_ATTEMPTS')
        ? 'icafe.tooManyAttempts'
        : error?.includes('ICAFE_INVALID_CODE')
          ? 'icafe.invalidCode'
          : error?.includes('ICAFE_INVALID_CONFIG')
            ? 'icafe.invalidConfig'
            : error?.includes('ICAFE_UNLINK_UNAVAILABLE')
              ? 'icafe.unlinkUnavailable'
              : 'icafe.linkUnavailable'

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/80"
        aria-label={t('icafe.close')}
        onClick={close}
      />
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="icafe-panel-title"
        className="relative z-10 w-full max-w-md border border-sky-400/30 bg-slate-950 p-6 text-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="icafe-panel-title" className="text-xl font-semibold">
              {t('icafe.title')}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{t('icafe.shortcut')}</p>
          </div>
          <Button
            variant="ghost"
            className="size-9 p-0"
            aria-label={t('icafe.close')}
            onClick={close}
          >
            <X className="size-5" />
          </Button>
        </div>

        {status.info ? (
          <div className="mt-6 border border-sky-400/35 bg-sky-400/10 p-4">
            <p className="font-semibold">
              {t('auth.icafeBranch', { branch: status.info.branchName })}
            </p>
            <p className="mt-1 text-sm text-sky-200">{t('auth.icafeBenefit')}</p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-300">
            {status.hasConfig ? t('icafe.cannotVerify') : t('icafe.notLinked')}
          </p>
        )}

        {status.managedExternally ? (
          <p className="mt-5 text-sm text-slate-400">{t('icafe.managedExternally')}</p>
        ) : (
          <>
            <form onSubmit={submit} className="mt-6 space-y-3">
              <label htmlFor="icafe-link-code" className="block text-sm font-medium">
                {t('icafe.codeLabel')}
              </label>
              <input
                ref={inputRef}
                id="icafe-link-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                className="w-full border border-slate-600 bg-slate-900 px-3 py-2 text-lg tracking-[0.35em] text-white focus:border-sky-400 focus:outline-none"
              />
              <p className="text-xs text-slate-400">{t('icafe.codeHelp')}</p>
              <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
                {busy ? t('icafe.working') : t('icafe.link')}
              </Button>
            </form>
            {status.hasConfig && (
              <Button
                variant="ghost"
                disabled={busy}
                className="mt-3 w-full text-red-300"
                onClick={() => void unlink()}
              >
                {t('icafe.unlink')}
              </Button>
            )}
          </>
        )}
        <div className="min-h-6 pt-2" role="status" aria-live="polite">
          {error && <p className="text-sm text-red-300">{t(errorKey)}</p>}
        </div>
      </section>
    </div>
  )
}
