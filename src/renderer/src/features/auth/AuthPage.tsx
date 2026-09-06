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

  // // Temporary development preview for the lobby/model viewer. Keeping this after
  // // hook and handler declarations avoids leaving the rest of the component unreachable.
  // if (import.meta.env.DEV) {
  //   return <LobbyPage />
  // }

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

          <Button
            className="mt-3 w-full"
            variant="ghost"
            onClick={() => void window.api.window.exit()}
          >
            Exit to desktop
          </Button>
        </div>
      </section>
    </main>
  )
}
