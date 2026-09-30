import { useEffect, useRef, type FormEvent, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Logo } from '../../components/ui/Logo'
import { TextField } from '../../components/ui/TextField'
import { SocialProviderIcon } from '../../components/ui/SocialProviderIcon'
import { PapamoWordmark } from '../../components/ui/PapamoWordmark'
import { useAuthStore } from './auth.store'
import { UsernameSetupPage } from './UsernameSetupPage'
import { LobbyPage } from '../matchmaking/LobbyPage'
import { PlayPage } from '../matchmaking/PlayPage'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { isWebRuntime } from '../../web-runtime'
import operationBackground from '../../assets/operations/pixel-water-background.png'

const socialProviderLabel = (provider: 'google' | 'facebook' | 'discord'): string =>
  provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'Discord'

export function AuthPage(): JSX.Element {
  const mode = useAuthStore((state) => state.mode)
  const username = useAuthStore((state) => state.username)
  const email = useAuthStore((state) => state.email)
  const password = useAuthStore((state) => state.password)
  const status = useAuthStore((state) => state.status)
  const socialProvider = useAuthStore((state) => state.socialProvider)
  const socialPollToken = useAuthStore((state) => state.socialPollToken)
  const socialPasswordRequired = useAuthStore((state) => state.socialPasswordRequired)
  const error = useAuthStore((state) => state.error)
  const session = useAuthStore((state) => state.session)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const gameExited = useMatchmakingStore((state) => state.gameExited)
  const requiresGameSetup = useGameSettingsStore((state) => state.requiresGameSetup)
  const setMode = useAuthStore((state) => state.setMode)
  const setUsername = useAuthStore((state) => state.setUsername)
  const setEmail = useAuthStore((state) => state.setEmail)
  const setPassword = useAuthStore((state) => state.setPassword)
  const submit = useAuthStore((state) => state.submit)
  const loginWithSocial = useAuthStore((state) => state.loginWithSocial)
  const submitSocialEmail = useAuthStore((state) => state.submitSocialEmail)
  const submitSocialPassword = useAuthStore((state) => state.submitSocialPassword)
  const restore = useAuthStore((state) => state.restore)
  const hasMaximized = useRef(false)
  const restoreStarted = useRef(false)
  const isLogin = mode === 'login'
  const isSubmitting = status === 'submitting'
  const webRuntime = isWebRuntime()

  useEffect(() => {
    if (restoreStarted.current) return
    restoreStarted.current = true
    void restore()
  }, [restore])

  useEffect(() => {
    if (
      (status === 'authenticated' || status === 'changing_username') &&
      session &&
      !hasMaximized.current
    ) {
      hasMaximized.current = true
      void window.api.window.maximize()
      return
    }

    if ((status !== 'authenticated' && status !== 'changing_username') || !session) {
      hasMaximized.current = false
    }
  }, [session, status])

  useEffect(() => {
    if (socialPollToken && socialProvider) {
      void window.api.window.focus()
    }
  }, [socialPollToken, socialProvider])

  if (
    session &&
    session.player.requiresUsernameSetup &&
    (status === 'authenticated' || status === 'changing_username' || status === 'logging_out')
  ) {
    return <UsernameSetupPage />
  }

  if (
    (status === 'authenticated' || status === 'changing_username' || status === 'logging_out') &&
    session
  ) {
    // Once Counter-Strike is running, unmount the lobby entirely. The lobby
    // owns the animated Three.js party scene and several chat/social surfaces;
    // keeping them mounted competes with the game for GPU and memory.
    const gameStarted = queueStatus === 'server_ready' && !gameExited && !requiresGameSetup
    return gameStarted ? <PlayPage /> : <LobbyPage />
  }

  if (status === 'restoring') {
    return (
      <main
        className="fixed inset-0 flex h-screen w-screen items-center justify-center bg-neutral-950"
        aria-label="Restoring your session"
        role="status"
      >
        <LoaderCircle className="size-8 animate-spin text-sky-400" aria-hidden="true" />
      </main>
    )
  }

  if (socialPollToken && socialProvider) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-md border border-sky-300/15 bg-slate-950/95 p-7 shadow-2xl sm:p-10">
          <Logo className="mb-8 size-16" />
          <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">
            {socialPasswordRequired ? 'Account verification' : 'Step 1 of 2'}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {socialPasswordRequired ? 'Confirm your account' : 'Add your email'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            {socialPasswordRequired
              ? `An account already uses this email. Enter its password to connect ${socialProviderLabel(socialProvider)} and sign in.`
              : `${socialProviderLabel(socialProvider)} did not share an email address. Add one to create your 1.6 Competitive account. You’ll choose your username next.`}
          </p>

          <form
            className="mt-7 grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              void (socialPasswordRequired ? submitSocialPassword() : submitSocialEmail())
            }}
          >
            <TextField
              id="social-email"
              label="Email"
              type="email"
              value={email}
              maxLength={254}
              autoComplete="email"
              autoFocus
              disabled={isSubmitting || socialPasswordRequired}
              placeholder="player@example.com"
              hint={
                socialPasswordRequired
                  ? 'This email came from the existing account and cannot be changed here.'
                  : 'We use this to secure and identify your account.'
              }
              className="placeholder:text-neutral-300 focus:border-sky-400/70 focus:ring-sky-400/10"
              onChange={(event) => setEmail(event.target.value)}
            />

            {socialPasswordRequired && (
              <TextField
                id="social-account-password"
                label="Account password"
                type="password"
                value={password}
                minLength={8}
                maxLength={128}
                autoComplete="current-password"
                autoFocus
                disabled={isSubmitting}
                placeholder="Enter your existing password"
                className="placeholder:text-neutral-300 focus:border-sky-400/70 focus:ring-sky-400/10"
                onChange={(event) => setPassword(event.target.value)}
              />
            )}

            <div className="min-h-5" aria-live="polite">
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <Button
              className="w-full bg-sky-400 hover:bg-sky-300 focus-visible:outline-sky-300 disabled:bg-sky-400/50"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? socialPasswordRequired
                  ? 'Verifying…'
                  : 'Checking email…'
                : socialPasswordRequired
                  ? `Connect ${socialProviderLabel(socialProvider)} and sign in`
                  : 'Continue'}
            </Button>
          </form>

          <Button
            className="mt-3 w-full"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => setMode('login')}
          >
            Back to login
          </Button>
        </section>
      </main>
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void (socialPollToken ? submitSocialEmail() : submit())
  }

  return (
    <main className="relative isolate grid min-h-screen grid-cols-3 overflow-hidden bg-slate-950 text-white">
      <img
        className="absolute inset-0 -z-20 h-full w-full object-cover"
        src={operationBackground}
        alt=""
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-slate-950/35" />
      <div className="flex flex-col justify-center items-center inset-0">
        <Logo className="z-10 size-10 md:top-12 md:left-[calc(27.5vw-16rem)] md:size-128" />

        <div className="relative mt-8 hidden flex-col items-center border border-white/10 bg-slate-950/80 px-5 py-4 text-center shadow-xl backdrop-blur-sm md:flex">
          <p className="text-sm font-bold text-white">COUNTER-STRIKE 1.6 RANKED CLIENT</p>
          <PapamoWordmark className="mt-3 text-xl" />
        </div>
      </div>

      <section className="flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm sm:p-10 col-span-2">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-tight">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              {isLogin
                ? 'Sign in to continue to matchmaking.'
                : 'Choose how you want to create your account.'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 bg-slate-900 p-1">
            <Button
              variant="ghost"
              className={isLogin ? 'bg-sky-500 text-slate-950 hover:bg-sky-400' : undefined}
              disabled={isSubmitting}
              onClick={() => setMode('login')}
            >
              Login
            </Button>
            <Button
              variant="ghost"
              className={!isLogin ? 'bg-sky-500 text-slate-950 hover:bg-sky-400' : undefined}
              disabled={isSubmitting}
              onClick={() => setMode('register')}
            >
              Register
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="ghost"
              className="gap-2 border border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:bg-neutral-800 grow"
              disabled={isSubmitting && socialProvider !== 'google'}
              onClick={() => void loginWithSocial('google')}
            >
              {socialProvider === 'google' ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <SocialProviderIcon provider="google" />
              )}
              Google
            </Button>
            <Button
              variant="ghost"
              className="gap-2 border border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:bg-neutral-800"
              disabled={isSubmitting && socialProvider !== 'discord'}
              onClick={() => void loginWithSocial('discord')}
            >
              {socialProvider === 'discord' ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <SocialProviderIcon provider="discord" />
              )}
              Discord
            </Button>
            {/* <Button
              variant="ghost"
              className="gap-2 border border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:bg-neutral-800 grow"
              disabled={isSubmitting}
              onClick={() => void loginWithSocial('facebook')}
            >
              {socialProvider === 'facebook' ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <SocialProviderIcon provider="facebook" />
              )}
              Facebook
            </Button> */}
          </div>

          {socialProvider && (
            <p className="mt-3 text-center text-xs text-neutral-400" role="status">
              Finish {isLogin ? 'signing in' : 'creating your account'} with{' '}
              {socialProviderLabel(socialProvider)} in your browser. Click it again to reopen the
              browser.
            </p>
          )}

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-neutral-800" />
            <span className="text-xs uppercase tracking-wider text-neutral-600">or</span>
            <span className="h-px flex-1 bg-neutral-800" />
          </div>

          <form className="grid gap-5" onSubmit={handleSubmit}>
            <TextField
              id="username"
              label="Username"
              value={username}
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
              autoComplete="username"
              autoFocus
              disabled={isSubmitting}
              placeholder="player_name"
              hint="3–32 characters: letters, numbers, and underscores"
              className="placeholder:text-neutral-300 focus:border-sky-400/70 focus:ring-sky-400/10"
              onChange={(event) => setUsername(event.target.value)}
            />
            {(!isLogin || socialPollToken) && (
              <TextField
                id="email"
                label="Email"
                type="email"
                value={email}
                maxLength={254}
                autoComplete="email"
                disabled={isSubmitting}
                placeholder="player@example.com"
                hint={
                  socialPollToken
                    ? `${socialProvider ? socialProviderLabel(socialProvider) : 'The provider'} did not provide an email address. Add one to continue.`
                    : undefined
                }
                className="placeholder:text-neutral-300 focus:border-sky-400/70 focus:ring-sky-400/10"
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
            {!socialPollToken && (
              <TextField
                id="password"
                label="Password"
                type="password"
                value={password}
                minLength={8}
                maxLength={128}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                disabled={isSubmitting}
                placeholder="At least 8 characters"
                className="placeholder:text-neutral-300 focus:border-sky-400/70 focus:ring-sky-400/10"
                onChange={(event) => setPassword(event.target.value)}
              />
            )}

            <div className="min-h-5" aria-live="polite">
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <Button
              className="w-full bg-sky-400 hover:bg-sky-300 focus-visible:outline-sky-300 disabled:bg-sky-400/50"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting && !socialProvider
                ? isLogin && !socialPollToken
                  ? 'Signing in…'
                  : `Continue with ${socialProvider ? socialProviderLabel(socialProvider) : 'social login'}`
                : socialPollToken
                  ? `Continue with ${socialProvider ? socialProviderLabel(socialProvider) : 'social login'}`
                  : isLogin
                    ? 'Sign in'
                    : 'Create account'}
            </Button>
          </form>

          <Button
            className="mt-3 w-full"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => void window.api.window.exit()}
          >
            Exit to desktop
          </Button>

          {webRuntime && (
            <a
              href="https://papamo.dev/16competitive"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold tracking-wide text-sky-300 transition hover:text-sky-200 hover:underline"
            >
              Get the desktop app <span aria-hidden="true">↗</span>
            </a>
          )}

          <p className="mt-5 text-center text-xs text-neutral-500">
            <a
              href="https://papamo.dev/privacy"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-neutral-300 hover:underline"
            >
              Privacy Policy
            </a>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <a
              href="https://papamo.dev/terms"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-neutral-300 hover:underline"
            >
              Terms &amp; Conditions
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}
