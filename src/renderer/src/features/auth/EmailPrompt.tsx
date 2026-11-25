import { useEffect, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import { Button } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { TextField } from '../../components/ui/TextField'
import type { EmailPreferenceAction } from '../../../../shared/email-preference'
import { useAuthStore } from './auth.store'
import { useTranslation } from '../i18n/i18n'
import { usePartnerBrandingStore } from "../partner-branding/partner-branding.store"
import { loadEmail, useEmailStore } from './email.store'
import copy from './email-copy.json'

type Copy = (typeof copy)['en']

async function submit(action: EmailPreferenceAction, text: Copy, owner: string): Promise<boolean> {
  const notice = toast.loading(text.working)
  let message = text.error
  let ok = false
  try {
    const data = await window.api.auth.emailPreference(action)
    if (owner === useEmailStore.getState().owner) {
      useEmailStore.setState({ data, ...(action.action === 'verify' || action.action === 'marketing' ? { open: false } : {}) })
      if (action.action === 'verify') {
        useAuthStore.getState().setPoints(data.points)
        await useAuthStore.getState().refreshSession()
      }
    }
    ok = true
    message = action.action === 'verify' ? text.verified : action.action === 'send' ? text.sent : text.saved
  } catch (error) {
    const msg = String(error)
    if (msg.includes('WAIT')) message = text.wait
    else if (msg.includes('INVALID_CODE')) message = text.invalid
    else if (msg.includes('EMAIL_UNAVAILABLE')) message = text.used
    else if (msg.includes('DELIVERY')) message = text.delivery
  } finally {
    toast.update(notice, { render: message, type: ok ? 'success' : 'error', isLoading: false, autoClose: 4500 })
  }
  return ok
}

function VerifyDialog({ owner, initialEmail }: { owner: string; initialEmail: string }): JSX.Element {
  const text = copy[useTranslation().language]
  const data = useEmailStore(s => s.data)
  const [email, setEmail] = useState(initialEmail)
  const [editing, setEditing] = useState(!initialEmail)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [marketing, setMarketing] = useState(false)
  const [busy, setBusy] = useState(false)
  const close = (): void => {
    if (busy) return
    sessionStorage.setItem(`email-later:${owner}`, '1')
    useEmailStore.setState({ open: false })
  }
  return <ModalDialog open onClose={close} vguiTitlebar={false} labelledBy="email-prompt-title" className="max-w-md bg-neutral-900 p-5 text-neutral-100">
    <h2 id="email-prompt-title" className="text-xl font-semibold">{data?.verified ? (data.googleReward ? text.googleReward : text.prefs) : text.title}</h2>
    {data?.verified ? <div className="mt-3 space-y-4">
      <p>{text.question}</p>
      <p className="text-sm text-neutral-300">{text.marketing}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={close}>{text.later}</Button>
        {[false, true].map(enabled => <Button key={String(enabled)} disabled={busy} variant={enabled ? 'primary' : 'ghost'} onClick={async () => {
          setBusy(true)
          await submit({ action: 'marketing', enabled }, text, owner)
          setBusy(false)
        }}>{enabled ? text.yes : text.no}</Button>)}
      </div>
    </div> : <>
    <p className="mb-5 mt-1 text-sm text-neutral-300">{text.reward}</p>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setBusy(true)
      const ok = await submit(sent ? { action: 'verify', email: email.trim(), code, marketing } : { action: 'send', email: email.trim() }, text, owner)
      if (ok) { setSent(true); setEditing(false) }
      setBusy(false)
    }}>
      <TextField id="verification-email" label={text.email} type="email" autoComplete="email" value={email} required maxLength={254}
        readOnly={!editing} disabled={busy} onChange={event => setEmail(event.target.value)} />
      {!editing && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(true); setSent(false); setCode('') }}>{text.change}</Button>}
      {sent && <TextField id="verification-code" label={text.code} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} />}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={marketing} disabled={busy} onChange={e => setMarketing(e.target.checked)} />{text.marketing}</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={close}>{text.later}</Button>
        <Button type="submit" disabled={busy}>{sent ? text.verify : text.send}</Button></div>
    </form></>}
  </ModalDialog>
}

export function EmailPrompt({ partnerOnly }: { partnerOnly: boolean }): JSX.Element | null {
  const session = useAuthStore(s => s.session)
  const allowed = usePartnerBrandingStore(s => s.resolved && s.accountId === session?.player.id && !s.branding?.disableEmailCollection && !s.joinedBranding?.disableEmailCollection)
  const owner = allowed && session && !session.player.requiresUsernameSetup && !session.partnerLogin && !partnerOnly ? `${session.player.id}/${session.expiresAt}` : ''
  const state = useEmailStore()
  useEffect(() => { void loadEmail(owner, true) }, [owner])
  return owner && owner === state.owner && state.open && state.data
    ? <VerifyDialog key={owner} owner={owner} initialEmail={state.data.email ?? ''} /> : null
}

export function EmailSettings(): JSX.Element | null {
  const { owner, data, failed } = useEmailStore()
  const text = copy[useTranslation().language]
  const [busy, setBusy] = useState(false)
  if (!owner) return null
  return <section className="mt-5 border border-white/10 p-5">
    <h3 className="mb-3 font-semibold">{text.prefs}</h3>
    {failed ? <Button onClick={async () => {
      const notice = toast.loading(text.working)
      await loadEmail(owner, false)
      const failure = useEmailStore.getState().failed
      toast.update(notice, { render: failure ? text.error : text.prefs, isLoading: false, type: failure ? 'error' : 'success', autoClose: 3000 })
    }}>{text.prefs}</Button> : !data ? <span>{text.working}</span> : data.verified
      ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={data.marketing === true} disabled={busy} onChange={async e => {
          setBusy(true); await submit({ action: 'marketing', enabled: e.target.checked }, text, owner); setBusy(false)
        }} />{text.marketing}</label>
      : <Button onClick={() => useEmailStore.setState({ open: true })}>{text.title}</Button>}
  </section>
}
