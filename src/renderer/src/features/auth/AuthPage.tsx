import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Logo } from '../../components/ui/Logo'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from './auth.store'
import { LobbyPage } from '../matchmaking/LobbyPage'
import { localMapPreviews } from '../matchmaking/map-previews'

const mapPreviewSources = Object.values(localMapPreviews)

export function AuthPage(): JSX.Element {
  const mode = useAuthStore((state) => state.mode)
  const username = useAuthStore((state) => state.username)
  const email = useAuthStore((state) => state.email)
  const password = useAuthStore((state) => state.password)
  const status = useAuthStore((state) => state.status)
  const socialProvider = useAuthStore((state) => state.socialProvider)
  const error = useAuthStore((state) => state.error)
  const session = useAuthStore((state) => state.session)
  const setMode = useAuthStore((state) => state.setMode)
  const setUsername = useAuthStore((state) => state.setUsername)
  const setEmail = useAuthStore((state) => state.setEmail)
  const setPassword = useAuthStore((state) => state.setPassword)
  const submit = useAuthStore((state) => state.submit)
  const loginWithSocial = useAuthStore((state) => state.loginWithSocial)
  const restore = useAuthStore((state) => state.restore)
  const hasMaximized = useRef(false)
  const restoreStarted = useRef(false)
  const [backgroundPreview] = useState(
    () => mapPreviewSources[Math.floor(Math.random() * mapPreviewSources.length)]
  )

  useEffect(() => {
    if (restoreStarted.current) return
    restoreStarted.current = true
    void restore()
  }, [restore])

  useEffect(() => {
    if (status === 'authenticated' && session && !hasMaximized.current) {
      hasMaximized.current = true
      void window.api.window.maximize()
      return
    }

    if (status !== 'authenticated' || !session) {
      hasMaximized.current = false
    }
  }, [session, status])

  if ((status === 'authenticated' || status === 'logging_out') && session) {
    return <LobbyPage />
  }

  if (status === 'restoring') {
    return (
      <main
        className="fixed inset-0 flex h-screen w-screen items-center justify-center bg-neutral-950"
        aria-label="Restoring your session"
        role="status"
      >
        <LoaderCircle className="size-8 animate-spin text-amber-400" aria-hidden="true" />
      </main>
    )
  }

  const isLogin = mode === 'login'
  const isSubmitting = status === 'submitting'

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void submit()
  }

  return (
    <main className="relative isolate grid min-h-screen grid-cols-3 overflow-hidden bg-neutral-950 text-white">
      <img
        className="absolute inset-0 -z-20 h-full w-full object-cover"
        src={backgroundPreview}
        alt=""
      />
      <div className="flex flex-col justify-center items-center inset-0 bg-[linear-gradient(90deg,rgba(10,10,10,0.55),rgba(10,10,10,0.78)_55%,rgba(10,10,10,0.94))]">
        <Logo className="z-10 size-10 md:top-12 md:left-[calc(27.5vw-16rem)] md:size-128" />

        <p className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between font-bold text-white/80 text-center">
          COUNTER-STRIKE 1.6 RANKED CLIENT
          <br />
          BY PAPAMO GAMES
        </p>
      </div>

      <section className="flex items-center justify-center bg-neutral-950/80 p-6 backdrop-blur-sm sm:p-10 col-span-2">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-tight">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              {isLogin ? 'Sign in to continue to matchmaking.' : 'Choose your player credentials.'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-lg bg-neutral-900 p-1">
            <Button
              variant="ghost"
              className={isLogin ? 'bg-neutral-800 text-white hover:bg-neutral-800' : undefined}
              disabled={isSubmitting}
              onClick={() => setMode('login')}
            >
              Login
            </Button>
            <Button
              variant="ghost"
              className={!isLogin ? 'bg-neutral-800 text-white hover:bg-neutral-800' : undefined}
              disabled={isSubmitting}
              onClick={() => setMode('register')}
            >
              Register
            </Button>
          </div>

          {isLogin && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="ghost"
                  className="gap-2 border border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:bg-neutral-800"
                  disabled={isSubmitting}
                  onClick={() => void loginWithSocial('google')}
                >
                  {socialProvider === 'google' ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <span
                      className="grid size-5 place-items-center rounded-full bg-white text-xs font-bold text-neutral-900"
                      aria-hidden="true"
                    >
                      G
                    </span>
                  )}
                  Google
                </Button>
                <Button
                  variant="ghost"
                  className="gap-2 border border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:bg-neutral-800"
                  disabled={isSubmitting}
                  onClick={() => void loginWithSocial('facebook')}
                >
                  {socialProvider === 'facebook' ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <span
                      className="grid size-5 place-items-center rounded-full bg-[#1877F2] text-sm font-bold text-white"
                      aria-hidden="true"
                    >
                      f
                    </span>
                  )}
                  Facebook
                </Button>
              </div>

              {socialProvider && (
                <p className="mt-3 text-center text-xs text-neutral-400" role="status">
                  Finish signing in with {socialProvider === 'google' ? 'Google' : 'Facebook'} in
                  your browser.
                </p>
              )}

              <div className="my-5 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-neutral-800" />
                <span className="text-xs uppercase tracking-wider text-neutral-600">or</span>
                <span className="h-px flex-1 bg-neutral-800" />
              </div>
            </>
          )}

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
              onChange={(event) => setUsername(event.target.value)}
            />
            {!isLogin && (
              <TextField
                id="email"
                label="Email"
                type="email"
                value={email}
                maxLength={254}
                autoComplete="email"
                disabled={isSubmitting}
                placeholder="player@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
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
              onChange={(event) => setPassword(event.target.value)}
            />

            <div className="min-h-5" aria-live="polite">
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting && !socialProvider
                ? isLogin
                  ? 'Signing in…'
                  : 'Creating account…'
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
        </div>
      </section>
    </main>
  )
}
