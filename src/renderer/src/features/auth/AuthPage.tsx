import { useEffect, useRef, type FormEvent, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from './auth.store'
import { LobbyPage } from '../matchmaking/LobbyPage'

export function AuthPage(): JSX.Element {
  const mode = useAuthStore((state) => state.mode)
  const username = useAuthStore((state) => state.username)
  const email = useAuthStore((state) => state.email)
  const password = useAuthStore((state) => state.password)
  const status = useAuthStore((state) => state.status)
  const error = useAuthStore((state) => state.error)
  const session = useAuthStore((state) => state.session)
  const setMode = useAuthStore((state) => state.setMode)
  const setUsername = useAuthStore((state) => state.setUsername)
  const setEmail = useAuthStore((state) => state.setEmail)
  const setPassword = useAuthStore((state) => state.setPassword)
  const submit = useAuthStore((state) => state.submit)
  const restore = useAuthStore((state) => state.restore)
  const hasMaximized = useRef(false)
  const restoreStarted = useRef(false)

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

  // // Temporary development preview for the lobby/model viewer. Keeping this after
  // // hook and handler declarations avoids leaving the rest of the component unreachable.
  // if (import.meta.env.DEV) {
  //   return <LobbyPage />
  // }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-neutral-950 text-white md:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden border-r border-white/5 bg-neutral-900 p-12 md:flex md:flex-col md:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.12),transparent_38%)]" />
        <p className="relative text-sm font-bold tracking-[0.24em] text-amber-400 uppercase">
          1.6 Competitive
        </p>
        <div className="relative max-w-lg">
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">
            Classic game. Modern competition.
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight lg:text-5xl">
            Queue up. Find your match. Prove your rank.
          </h1>
        </div>
        <p className="relative text-xs text-neutral-600">Counter-Strike 1.6 matchmaking client</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <p className="text-sm font-bold tracking-[0.22em] text-amber-400 uppercase">
              1.6 Competitive
            </p>
          </div>

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
              onClick={() => setMode('login')}
            >
              Login
            </Button>
            <Button
              variant="ghost"
              className={!isLogin ? 'bg-neutral-800 text-white hover:bg-neutral-800' : undefined}
              onClick={() => setMode('register')}
            >
              Register
            </Button>
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
              placeholder="At least 8 characters"
              onChange={(event) => setPassword(event.target.value)}
            />

            <div className="min-h-5" aria-live="polite">
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? isLogin
                  ? 'Signing in…'
                  : 'Creating account…'
                : isLogin
                  ? 'Sign in'
                  : 'Create account'}
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
