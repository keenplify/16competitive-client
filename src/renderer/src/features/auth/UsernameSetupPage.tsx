import { useTranslation } from '../i18n/i18n'
import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { SetupCard } from '../../components/ui/SetupCard'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from './auth.store'

const usernamePattern = /^[A-Za-z0-9_]{3,32}$/

export function UsernameSetupPage(): JSX.Element {
  const { t } = useTranslation()
  const session = useAuthStore((state) => state.session)
  const status = useAuthStore((state) => state.status)
  const error = useAuthStore((state) => state.error)
  const checkUsername = useAuthStore((state) => state.checkUsername)
  const changeUsername = useAuthStore((state) => state.changeUsername)
  const logout = useAuthStore((state) => state.logout)
  const partnerUsername = session?.player.partnerUsername
  const suggestions = session?.player.usernameSuggestions ?? []
  const [username, setUsername] = useState(suggestions[0] ?? partnerUsername ?? '')
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>(
    'idle'
  )
  const usernameIsValid = usernamePattern.test(username)
  const displayedAvailability = usernameIsValid ? availability : 'idle'

  useEffect(() => {
    if (!usernameIsValid) return

    let cancelled = false
    const timer = setTimeout(() => {
      void checkUsername(username).then((available) => {
        if (!cancelled) setAvailability(available ? 'available' : 'taken')
      })
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [checkUsername, username, usernameIsValid])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (displayedAvailability !== 'available' || status === 'changing_username') return
    void changeUsername(username)
  }

  return (
    <SetupCard
      eyebrow="Account setup"
      title="Choose your username"
      description="This is the name other players will see in 1.6 Competitive. After you choose it, you can change it again from Settings once every 7 days."
      footer={
        <>
          <p data-i18n-skip className="mb-3 text-xs text-neutral-500">
            {t('auth.signedInAs', {
              account: session?.player.email ?? session?.player.username ?? ''
            })}
          </p>
          <Button variant="ghost" className="w-full" onClick={() => void logout()}>
            Use a different account
          </Button>
        </>
      }
    >
      <form className="grid gap-5" onSubmit={submit}>
        {partnerUsername && suggestions.length > 0 && (
          <div className="grid gap-3 text-sm">
            <p>
              Your partner username <strong data-i18n-skip>{partnerUsername}</strong> could not be
              used here. Choose an available username:
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Suggested usernames">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  variant="secondary"
                  disabled={status === 'changing_username'}
                  onClick={() => {
                    setUsername(suggestion)
                    setAvailability('checking')
                  }}
                >
                  <span data-i18n-skip>{suggestion}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
        <TextField
          id="first-username"
          label="Username"
          value={username}
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_]+"
          autoFocus
          autoComplete="off"
          disabled={status === 'changing_username'}
          placeholder="player_name"
          hint="3–32 characters: letters, numbers, and underscores"
          onChange={(event) => {
            const nextUsername = event.target.value
            setUsername(nextUsername)
            setAvailability(usernamePattern.test(nextUsername) ? 'checking' : 'idle')
          }}
        />

        <div className="min-h-6 text-sm" aria-live="polite">
          {displayedAvailability === 'checking' && (
            <p className="flex items-center gap-2 text-neutral-400">
              <LoaderCircle className="size-4 animate-spin" /> Checking availability…
            </p>
          )}
          {displayedAvailability === 'available' && (
            <p className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="size-4" /> Username is available
            </p>
          )}
          {displayedAvailability === 'taken' && (
            <p className="flex items-center gap-2 text-red-400">
              <XCircle className="size-4" /> Username is already taken
            </p>
          )}
          {error && <p className="mt-2 text-red-400">{error}</p>}
        </div>

        <Button
          type="submit"
          disabled={displayedAvailability !== 'available' || status === 'changing_username'}
        >
          {status === 'changing_username' ? 'Saving username…' : 'Continue'}
        </Button>
      </form>
    </SetupCard>
  )
}
