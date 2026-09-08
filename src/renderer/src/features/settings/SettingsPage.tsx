import { CheckCircle2, Download, LoaderCircle, LogOut, Power, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { useUpdaterStore } from '../updates/updater.store'
import { useGameSettingsStore } from './game-settings.store'

const usernamePattern = /^[A-Za-z0-9_]{3,32}$/

export function SettingsPage(): JSX.Element {
  const executablePath = useGameSettingsStore((state) => state.executablePath)
  const savedPath = useGameSettingsStore((state) => state.savedPath)
  const configFilePath = useGameSettingsStore((state) => state.configFilePath)
  const status = useGameSettingsStore((state) => state.status)
  const error = useGameSettingsStore((state) => state.error)
  const notice = useGameSettingsStore((state) => state.notice)
  const load = useGameSettingsStore((state) => state.load)
  const choose = useGameSettingsStore((state) => state.choose)
  const save = useGameSettingsStore((state) => state.save)
  const authStatus = useAuthStore((state) => state.status)
  const authError = useAuthStore((state) => state.error)
  const session = useAuthStore((state) => state.session)
  const checkUsername = useAuthStore((state) => state.checkUsername)
  const changeUsername = useAuthStore((state) => state.changeUsername)
  const logout = useAuthStore((state) => state.logout)
  const currentVersion = useUpdaterStore((state) => state.currentVersion)
  const [newUsername, setNewUsername] = useState('')
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [usernameNotice, setUsernameNotice] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const usernameAvailableAt = session?.player.usernameChangeAvailableAt ?? null
  const usernameCooldownActive = useMemo(() => {
    if (!usernameAvailableAt) return false
    const availableAt = Date.parse(usernameAvailableAt)
    return Number.isFinite(availableAt) && availableAt > Date.now()
  }, [usernameAvailableAt])

  useEffect(() => {
    setUsernameNotice(null)
    if (
      usernameCooldownActive ||
      !usernamePattern.test(newUsername) ||
      newUsername.toLocaleLowerCase('en-US') === session?.player.username.toLocaleLowerCase('en-US')
    ) {
      setAvailability('idle')
      return
    }

    let cancelled = false
    setAvailability('checking')
    const timer = setTimeout(() => {
      void checkUsername(newUsername).then((available) => {
        if (!cancelled) setAvailability(available ? 'available' : 'taken')
      })
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [checkUsername, newUsername, session?.player.username, usernameCooldownActive])

  const handleUsernameSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (availability !== 'available' || authStatus === 'changing_username') return
    void changeUsername(newUsername).then((changed) => {
      if (changed) {
        setUsernameNotice('Username changed. You can change it again in 7 days.')
        setNewUsername('')
        setAvailability('idle')
      }
    })
  }

  const cooldownLabel = usernameCooldownActive && usernameAvailableAt
    ? new Date(usernameAvailableAt).toLocaleString()
    : null

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-neutral-950/92 p-5 text-white sm:p-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold">Game installation</h1>

        <section className="mt-8 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
          <h2 className="text-lg font-semibold">Counter-Strike 1.6</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Choose the executable the launcher should start when a match server is ready.
          </p>

          {status !== 'loading' && !executablePath && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-sky-400/20 bg-sky-400/5 p-4">
              <p className="text-sm text-neutral-300">Counter-Strike is not installed yet?</p>
              <Button
                variant="ghost"
                className="border border-sky-400/35 text-sky-300 hover:bg-sky-400/10 hover:text-sky-200"
                onClick={() => void window.api.window.openCounterStrikeSteamStore()}
              >
                <Download className="mr-2 size-4" aria-hidden="true" />
                Download on Steam
              </Button>
            </div>
          )}

          <label className="mt-6 block text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            Executable path
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              className="h-11 min-w-0 flex-1 border border-white/15 bg-black/40 px-3 font-mono text-sm text-neutral-200 outline-none focus:border-sky-400"
              value={executablePath}
              readOnly
              placeholder="No Counter-Strike executable selected"
            />
            <Button variant="ghost" disabled={status !== 'idle'} onClick={() => void choose()}>
              {status === 'choosing' ? 'Opening…' : 'Browse'}
            </Button>
            <Button
              disabled={status !== 'idle' || !executablePath || executablePath === savedPath}
              onClick={() => void save()}
            >
              {status === 'saving' ? 'Saving…' : 'Save'}
            </Button>
          </div>

          <div className="mt-4 min-h-5 text-sm" aria-live="polite">
            {notice && <p className="text-emerald-300">{notice}</p>}
            {error && <p className="text-red-400">{error}</p>}
          </div>

          {configFilePath && (
            <p className="mt-6 break-all border-t border-white/10 pt-4 text-xs text-neutral-500">
              Saved locally in: <span className="font-mono">{configFilePath}</span>
            </p>
          )}
        </section>

        <section className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
          <h2 className="text-lg font-semibold">Account</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Your username is visible to other players. It can be changed once every 7 days.
          </p>

          <div className="mt-6 grid gap-2">
            <span className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
              Current username
            </span>
            <span className="font-mono text-base text-neutral-100">{session?.player.username ?? '—'}</span>
          </div>

          <form className="mt-5" onSubmit={handleUsernameSubmit}>
            <label
              htmlFor="settings-username"
              className="block text-xs font-semibold tracking-wide text-neutral-400 uppercase"
            >
              New username
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="settings-username"
                className="h-11 min-w-0 flex-1 border border-white/15 bg-black/40 px-3 text-sm text-neutral-200 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                value={newUsername}
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                disabled={usernameCooldownActive || authStatus === 'changing_username'}
                placeholder="player_name"
                autoComplete="off"
                onChange={(event) => setNewUsername(event.target.value)}
              />
              <Button
                type="submit"
                disabled={
                  usernameCooldownActive ||
                  authStatus === 'changing_username' ||
                  availability !== 'available'
                }
              >
                {authStatus === 'changing_username' ? 'Saving…' : 'Change username'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              3–32 characters: letters, numbers, and underscores.
            </p>

            <div className="mt-3 min-h-6 text-sm" aria-live="polite">
              {cooldownLabel && (
                <p className="text-amber-300">You can change your username again on {cooldownLabel}.</p>
              )}
              {!usernameCooldownActive && availability === 'checking' && (
                <p className="flex items-center gap-2 text-neutral-400">
                  <LoaderCircle className="size-4 animate-spin" /> Checking availability…
                </p>
              )}
              {!usernameCooldownActive && availability === 'available' && (
                <p className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="size-4" /> Username is available
                </p>
              )}
              {!usernameCooldownActive && availability === 'taken' && (
                <p className="flex items-center gap-2 text-red-400">
                  <XCircle className="size-4" /> Username is already taken
                </p>
              )}
              {usernameNotice && <p className="text-emerald-300">{usernameNotice}</p>}
              {authError && <p className="text-red-400">{authError}</p>}
            </div>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
            <p className="text-sm text-neutral-400">Sign out of this launcher on this computer.</p>
            <Button
              className="border border-rose-400/35 bg-transparent text-rose-300 hover:bg-rose-400/10 hover:text-rose-200"
              variant="ghost"
              disabled={authStatus === 'logging_out' || authStatus === 'changing_username'}
              onClick={() => void logout()}
            >
              <LogOut className="mr-2 size-4" />
              {authStatus === 'logging_out' ? 'Signing out…' : 'Log out'}
            </Button>
          </div>
        </section>

        <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
          <div>
            <h2 className="text-lg font-semibold">Desktop</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Close the launcher and return to desktop.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Launcher version{' '}
              <span className="font-mono text-neutral-400">{currentVersion ?? '…'}</span>
            </p>
          </div>
          <Button
            variant="ghost"
            className="border border-white/15 text-neutral-300 hover:bg-white/10 hover:text-white"
            onClick={() => void window.api.window.exit()}
          >
            <Power className="mr-2 size-4" aria-hidden="true" />
            Exit to desktop
          </Button>
        </section>
      </div>
    </main>
  )
}
