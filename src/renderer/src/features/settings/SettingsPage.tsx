import { LogOut } from 'lucide-react'
import { useEffect, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { useGameSettingsStore } from './game-settings.store'

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
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    void load()
  }, [load])

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

        <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-rose-400/15 bg-rose-400/5 p-5 sm:p-7">
          <div>
            <h2 className="text-lg font-semibold">Account</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Sign out of this launcher on this computer.
            </p>
          </div>
          <Button
            className="border border-rose-400/35 bg-transparent text-rose-300 hover:bg-rose-400/10 hover:text-rose-200"
            variant="ghost"
            disabled={authStatus === 'logging_out'}
            onClick={() => void logout()}
          >
            <LogOut className="mr-2 size-4" />
            {authStatus === 'logging_out' ? 'Signing out…' : 'Log out'}
          </Button>
        </section>
      </div>
    </main>
  )
}
