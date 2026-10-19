import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useTranslation } from '../i18n/i18n'

export function PasswordResetPanel({
  initialIdentifier,
  onBack
}: {
  initialIdentifier: string
  onBack: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState(initialIdentifier)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [stage, setStage] = useState<'request' | 'code' | 'done'>('request')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (stage !== 'code') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [stage])

  const request = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      await window.api.auth.requestPasswordReset(identifier.trim())
      const sentAt = Date.now()
      setNow(sentAt)
      setResendAt(sentAt + 60_000)
      setStage('code')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  const resend = async () => {
    if (busy || Date.now() < resendAt) return
    setBusy(true)
    setError(false)
    try {
      await window.api.auth.requestPasswordReset(identifier.trim())
      setCode('')
      const sentAt = Date.now()
      setNow(sentAt)
      setResendAt(sentAt + 60_000)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  const complete = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      await window.api.auth.completePasswordReset(identifier.trim(), code, newPassword)
      setNewPassword('')
      setStage('done')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="min-h-[34rem]" aria-labelledby="reset-title">
      <h2 id="reset-title" className="text-3xl font-semibold">
        {t('auth.reset.title')}
      </h2>
      <p className="mt-3 text-sm text-neutral-300">{t('auth.reset.description')}</p>
      {stage === 'request' && (
        <form className="mt-6 grid gap-5" onSubmit={(event) => void request(event)}>
          <TextField
            id="reset-identifier"
            label={t('auth.reset.identifier')}
            value={identifier}
            required
            maxLength={254}
            autoComplete="username"
            autoFocus
            disabled={busy}
            onChange={(event) => setIdentifier(event.target.value)}
          />
          <Button type="submit" disabled={busy} className="w-full">
            {t('auth.reset.send')}
          </Button>
        </form>
      )}
      {stage === 'code' && (
        <>
          <p className="mt-6 text-sm text-sky-200" role="status">
            {t('auth.reset.sent')}
          </p>
          <form className="mt-5 grid gap-5" onSubmit={(event) => void complete(event)}>
            <TextField
              id="reset-code"
              label={t('auth.reset.code')}
              value={code}
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              disabled={busy}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
            <TextField
              id="reset-new-password"
              label={t('auth.reset.password')}
              type="password"
              value={newPassword}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              disabled={busy}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <Button type="submit" disabled={busy} className="w-full">
              {t('auth.reset.confirm')}
            </Button>
          </form>
          <Button
            variant="ghost"
            className="mt-3 w-full"
            disabled={busy || now < resendAt}
            onClick={() => void resend()}
          >
            {t('auth.reset.resend')}
            {now < resendAt ? ` (${Math.ceil((resendAt - now) / 1000)}s)` : ''}
          </Button>
        </>
      )}
      {stage === 'done' && (
        <p className="mt-6 text-sm text-sky-200" role="status">
          {t('auth.reset.done')}
        </p>
      )}
      <div className="min-h-12 pt-3 text-sm text-rose-300" role="alert">
        {error ? t('auth.reset.error') : ''}
      </div>
      <Button variant="ghost" className="w-full" disabled={busy} onClick={onBack}>
        {t('auth.reset.back')}
      </Button>
    </section>
  )
}
