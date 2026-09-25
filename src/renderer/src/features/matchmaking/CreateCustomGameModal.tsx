import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import { X } from 'lucide-react'
import type { CustomGameMode } from '../../../../shared/custom-games'
import type { MatchmakingMap } from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useCustomGamesStore } from './custom-games.store'

interface CreateCustomGameModalProps {
  maps: MatchmakingMap[]
  selectedNodeId: string | null
  disabled?: boolean
}

const fieldClass =
  'h-11 w-full border border-white/15 bg-black/45 px-3 text-sm text-white outline-none transition focus:border-sky-400'

export function CreateCustomGameModal({
  maps,
  selectedNodeId,
  disabled = false
}: CreateCustomGameModalProps): JSX.Element {
  const close = useCustomGamesStore((state) => state.closeCreateModal)
  const createRoom = useCustomGamesStore((state) => state.createRoom)
  const error = useCustomGamesStore((state) => state.error)
  const [name, setName] = useState('Custom Game')
  const [mode, setMode] = useState<CustomGameMode>('unrated')
  const [mapId, setMapId] = useState('de_dust2')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)

  const supportedMaps = maps.filter(({ supportedModes }) => supportedModes.includes(mode))
  const selectedMapId = supportedMaps.some((map) => map.id === mapId)
    ? mapId
    : (supportedMaps[0]?.id ?? '')

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || submitting) return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', closeOnEscape)
    dialogRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      previousFocus?.focus()
    }
  }, [close, submitting])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (disabled || !selectedMapId || submitting) return
    setSubmitting(true)
    void createRoom({
      name: name.trim() || 'Custom Game',
      mode,
      mapId: selectedMapId,
      ...(password ? { password } : {})
    }).then((created) => {
      setSubmitting(false)
      if (created) close()
    })
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) close()
        }}
      >
        <section
          ref={dialogRef}
          className="w-full max-w-xl border border-white/20 bg-[#09090b] shadow-2xl outline-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-custom-game-title"
          tabIndex={-1}
        >
          <header className="flex items-start justify-between border-b border-white/15 px-6 py-5">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-sky-400 uppercase">
                Custom game
              </p>
              <h2 id="create-custom-game-title" className="mt-2 text-2xl font-semibold text-white">
                Create room
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                Configure the room before inviting players.
              </p>
            </div>
            <button
              type="button"
              className="p-2 text-neutral-500 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
              aria-label="Close create room dialog"
              disabled={submitting}
              onClick={close}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>

          <form className="grid gap-4 p-6" onSubmit={submit}>
            <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
              Room title
              <input
                className={fieldClass}
                value={name}
                maxLength={48}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
                Mode
                <select
                  className={fieldClass}
                  value={mode}
                  onChange={(event) => setMode(event.target.value as CustomGameMode)}
                >
                  <option value="unrated">Unranked</option>
                  <option value="ffa">FFA</option>
                </select>
              </label>
              <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
                Map
                <select
                  className={fieldClass}
                  value={selectedMapId}
                  disabled={supportedMaps.length === 0}
                  onChange={(event) => setMapId(event.target.value)}
                >
                  {supportedMaps.map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
              Password
              <input
                className={fieldClass}
                value={password}
                maxLength={64}
                type="password"
                autoComplete="new-password"
                placeholder="Optional"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {!selectedNodeId && (
              <p className="text-sm text-neutral-400">
                Automatic selects the lowest-ping available server for your room.
              </p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}

            <footer className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-5">
              <Button variant="ghost" type="button" disabled={submitting} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={disabled || submitting || !selectedMapId}>
                {submitting ? 'Creating…' : 'Create room'}
              </Button>
            </footer>
          </form>
        </section>
      </div>
    </ModalPortal>
  )
}
