import {
  CheckCircle2,
  Download,
  LoaderCircle,
  LogOut,
  Power,
  ShieldCheck,
  XCircle
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { useUpdaterStore } from '../updates/updater.store'
import { useGameSettingsStore } from './game-settings.store'

const usernamePattern = /^[A-Za-z0-9_]{3,32}$/
type SettingsSection = 'general' | 'credentials'

const readableError = (error: unknown): string =>
  error instanceof Error ? error.message.replace(/^Error:\s*/, '') : 'Something went wrong. Please try again.'

export function SettingsPage(): JSX.Element {
  const scrollRef = useRef<HTMLElement>(null)
  const generalRef = useRef<HTMLElement>(null)
  const credentialsRef = useRef<HTMLElement>(null)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

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
  const refreshSession = useAuthStore((state) => state.refreshSession)
  const logout = useAuthStore((state) => state.logout)
  const currentVersion = useUpdaterStore((state) => state.currentVersion)

  const [newUsername, setNewUsername] = useState('')
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [usernameNotice, setUsernameNotice] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const updateActiveSection = (): void => {
    const container = scrollRef.current
    const credentials = credentialsRef.current
    if (!container || !credentials) return

    const containerTop = container.getBoundingClientRect().top
    const credentialsTop = credentials.getBoundingClientRect().top - containerTop
    const activationLine = Math.min(220, container.clientHeight * 0.3)
    setActiveSection(credentialsTop <= activationLine ? 'credentials' : 'general')
  }

  useEffect(() => {
    updateActiveSection()
    window.addEventListener('resize', updateActiveSection)
    return () => window.removeEventListener('resize', updateActiveSection)
  }, [])

  const scrollToSection = (section: SettingsSection): void => {
    setActiveSection(section)
    const target = section === 'general' ? generalRef.current : credentialsRef.current
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setPasswordError(null)
    setPasswordNotice(null)

    if (session?.player.hasPassword && !currentPassword) {
      setPasswordError('Enter your password to verify.')
      return
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setPasswordError('New password must be 8–128 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setPasswordSaving(true)
    try {
      await window.api.auth.changePassword({
        ...(session?.player.hasPassword ? { currentPassword } : {}),
        newPassword
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordNotice(session?.player.hasPassword ? 'Password changed.' : 'Password created.')
      await refreshSession()
    } catch (passwordChangeError) {
      setPasswordError(readableError(passwordChangeError))
    } finally {
      setPasswordSaving(false)
    }
  }

  const cooldownLabel =
    usernameCooldownActive && usernameAvailableAt
      ? new Date(usernameAvailableAt).toLocaleString()
      : null

  const sectionButton = (section: SettingsSection, label: string): JSX.Element => {
    const active = activeSection === section
    return (
      <button
        type="button"
        onClick={() => scrollToSection(section)}
        className={`group relative w-full overflow-hidden rounded-md px-4 py-3 text-left text-sm font-medium transition-all duration-300 ${
          active
            ? 'translate-x-1 bg-sky-400/10 text-sky-300'
            : 'text-neutral-500 hover:translate-x-0.5 hover:bg-white/5 hover:text-neutral-200'
        }`}
      >
        <span
          className={`absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-400 transition-all duration-300 ${
            active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'
          }`}
        />
        {label}
      </button>
    )
  }

  return (
    <main
      ref={scrollRef}
      onScroll={updateActiveSection}
      className="h-[calc(100vh-5rem)] overflow-y-auto scroll-smooth bg-neutral-950/95 text-white"
    >
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-8">
          <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold">Launcher settings</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500">
            Configure the game client and manage the credentials tied to your account.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
          <aside className="sticky top-0 z-20 -mx-5 bg-neutral-950/95 px-5 py-3 backdrop-blur lg:top-6 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <nav className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-neutral-900/85 p-1.5 lg:grid-cols-1">
              {sectionButton('general', 'General')}
              {sectionButton('credentials', 'Credentials')}
            </nav>
          </aside>

          <div className="min-w-0">
            <section
              ref={generalRef}
              className="min-h-[70vh] scroll-mt-20 pb-16 lg:scroll-mt-8 lg:pb-24"
            >
              <div className="mb-5">
                <p className="text-xs font-semibold tracking-[0.18em] text-neutral-500 uppercase">
                  General
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Game client</h2>
              </div>

              <div className="border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
                <h3 className="text-lg font-semibold">Counter-Strike 1.6</h3>
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
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
                <div>
                  <h3 className="text-lg font-semibold">Desktop</h3>
                  <p className="mt-1 text-sm text-neutral-400">Close the launcher and return to desktop.</p>
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
              </div>
            </section>

            <section
              ref={credentialsRef}
              className="min-h-[calc(100vh-8rem)] scroll-mt-20 pb-20 lg:scroll-mt-8"
            >
              <div className="mb-5">
                <p className="text-xs font-semibold tracking-[0.18em] text-neutral-500 uppercase">
                  Credentials
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Account credentials</h2>
                <p className="mt-2 text-sm text-neutral-500">Manage the name and password used by your account.</p>
              </div>

              <div className="border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
                <h3 className="text-lg font-semibold">Username</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  Visible to other players. You can change it once every 7 days.
                </p>

                <div className="mt-6 grid gap-2">
                  <span className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                    Current username
                  </span>
                  <span className="font-mono text-base text-neutral-100">
                    {session?.player.username ?? '—'}
                  </span>
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
                  <p className="mt-2 text-xs text-neutral-500">3–32 characters: letters, numbers, and underscores.</p>

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
              </div>

              <div className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 text-sky-400" aria-hidden="true" />
                  <div>
                    <h3 className="text-lg font-semibold">
                      {session?.player.hasPassword ? 'Change password' : 'Create password'}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-400">
                      {session?.player.hasPassword
                        ? 'Verify your current password before replacing it.'
                        : 'Your social account does not have a password yet. Add one to enable username/password login.'}
                    </p>
                  </div>
                </div>

                <form className="mt-6 grid max-w-xl gap-4" onSubmit={(event) => void handlePasswordSubmit(event)}>
                  {session?.player.hasPassword && (
                    <div>
                      <label htmlFor="verify-password" className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                        Verify password
                      </label>
                      <input
                        id="verify-password"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        disabled={passwordSaving}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        className="mt-2 h-11 w-full border border-white/15 bg-black/40 px-3 text-sm text-neutral-200 outline-none focus:border-sky-400 disabled:opacity-50"
                      />
                    </div>
                  )}
                  <div>
                    <label htmlFor="new-password" className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                      New password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={newPassword}
                      disabled={passwordSaving}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="mt-2 h-11 w-full border border-white/15 bg-black/40 px-3 text-sm text-neutral-200 outline-none focus:border-sky-400 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                      Confirm new password
                    </label>
                    <input
                      id="confirm-password"
                      type="password"
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={confirmPassword}
                      disabled={passwordSaving}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="mt-2 h-11 w-full border border-white/15 bg-black/40 px-3 text-sm text-neutral-200 outline-none focus:border-sky-400 disabled:opacity-50"
                    />
                  </div>

                  <div className="min-h-6 text-sm" aria-live="polite">
                    {passwordError && <p className="text-red-400">{passwordError}</p>}
                    {passwordNotice && <p className="text-emerald-300">{passwordNotice}</p>}
                  </div>

                  <div>
                    <Button type="submit" disabled={passwordSaving}>
                      {passwordSaving
                        ? 'Saving…'
                        : session?.player.hasPassword
                          ? 'Change password'
                          : 'Create password'}
                    </Button>
                  </div>
                </form>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-rose-400/15 bg-rose-400/5 p-5 sm:p-7">
                <div>
                  <h3 className="text-lg font-semibold">Sign out</h3>
                  <p className="mt-1 text-sm text-neutral-400">Sign out of this launcher on this computer.</p>
                </div>
                <Button
                  className="border border-rose-400/35 bg-transparent text-rose-300 hover:bg-rose-400/10 hover:text-rose-200"
                  variant="ghost"
                  disabled={authStatus === 'logging_out' || authStatus === 'changing_username' || passwordSaving}
                  onClick={() => void logout()}
                >
                  <LogOut className="mr-2 size-4" />
                  {authStatus === 'logging_out' ? 'Signing out…' : 'Log out'}
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
