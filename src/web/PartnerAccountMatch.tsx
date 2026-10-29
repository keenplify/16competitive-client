import { useState, type FormEvent, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ModalDialog } from '../renderer/src/components/ui/ModalDialog'
import { Button } from '../renderer/src/components/ui/Button'
import { TextField } from '../renderer/src/components/ui/TextField'
import { usePartnerLoginStore } from './partner-login.store'

export function PartnerAccountMatch(): JSX.Element {
  const state = usePartnerLoginStore()
  const [credential, setCredential] = useState('')
  const busy = state.phase === 'verifying' || state.phase === 'email_sending'
  const isEmail = state.verificationMethod === 'email'
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const value = credential
    setCredential('')
    void state.verify(value)
  }
  const select = (method: 'password' | 'email'): void => {
    setCredential('')
    void state.selectVerification(method)
  }
  return (
    <ModalDialog
      open
      labelledBy="partner-account-match"
      onClose={state.cancel}
      className="max-w-lg p-6"
      vguiTitlebar={false}
    >
      <h2 id="partner-account-match" className="text-2xl font-semibold">
        {state.phase === 'account_match' ? 'Is this your account?' : 'Verify your account'}
      </h2>
      <p data-i18n-skip className="mt-4 text-xl font-semibold text-amber-300">
        {state.preview?.username}
      </p>
      <p className="mt-3 text-sm text-neutral-300">
        {state.phase === 'account_match'
          ? 'An account already uses this username. Verify it to keep your existing profile, or create a new account with a different username.'
          : isEmail
            ? 'Enter the 6-digit code sent to the email address on this account.'
            : 'Enter the password for your existing 1.6 Competitive account.'}
      </p>
      {busy ? (
        <p className="mt-6 flex items-center gap-3 text-sm" role="status">
          <LoaderCircle className="size-4 animate-spin" />
          {state.phase === 'email_sending'
            ? 'Sending verification code…'
            : 'Verifying your account…'}
        </p>
      ) : state.phase === 'account_match' ? (
        <div className="mt-6 grid gap-3">
          <Button onClick={() => select('password')}>Yes, verify with password</Button>
          <Button variant="secondary" onClick={() => select('email')}>
            Yes, verify with email
          </Button>
          <Button variant="ghost" onClick={() => void state.complete('sign_in', true)}>
            No, create new account
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <TextField
            id="partner-verification-credential"
            label={isEmail ? 'Verification code' : 'Password'}
            type={isEmail ? 'text' : 'password'}
            value={credential}
            required
            autoFocus
            autoComplete={isEmail ? 'one-time-code' : 'current-password'}
            inputMode={isEmail ? 'numeric' : undefined}
            pattern={isEmail ? '[0-9]{6}' : undefined}
            minLength={isEmail ? 6 : 1}
            maxLength={isEmail ? 6 : 1024}
            onChange={(event) => setCredential(event.target.value)}
          />
          <Button type="submit" disabled={isEmail ? !/^[0-9]{6}$/.test(credential) : !credential}>
            Verify and sign in
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => select(isEmail ? 'password' : 'email')}
          >
            {isEmail ? 'Use password instead' : 'Use email instead'}
          </Button>
          {isEmail && (
            <Button type="button" variant="ghost" onClick={() => select('email')}>
              Send a new code
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={state.backToAccountMatch}>
            Back
          </Button>
        </form>
      )}
      {state.verificationError && (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {state.verificationError}
        </p>
      )}
      {!busy && (
        <Button variant="ghost" className="mt-4 w-full" onClick={state.cancel}>
          Cancel
        </Button>
      )}
    </ModalDialog>
  )
}
