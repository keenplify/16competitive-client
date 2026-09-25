import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import { LockKeyhole, X } from 'lucide-react'
import type { CustomGameRoom } from '../../../../shared/custom-games'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useCustomGamesStore } from './custom-games.store'

interface JoinCustomGameModalProps {
  room: CustomGameRoom
  onClose: () => void
}

export function JoinCustomGameModal({ room, onClose }: JoinCustomGameModalProps): JSX.Element {
  const joinRoom = useCustomGamesStore((state) => state.joinRoom)
  const error = useCustomGamesStore((state) => state.error)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || submitting) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    passwordRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      previousFocus?.focus()
    }
  }, [onClose, submitting])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!password || submitting) return
    setSubmitting(true)
    void joinRoom(room.id, password, room.hostApiUrl).then((joined) => {
      setSubmitting(false)
      if (joined) onClose()
    })
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) onClose()
        }}
      >
        <section
          className="w-full max-w-md border border-white/20 bg-neutral-950 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-custom-game-title"
        >
          <header className="flex items-start justify-between border-b border-white/15 px-6 py-5">
            <div className="flex gap-3">
              <span className="flex size-10 items-center justify-center border border-amber-300/30 bg-amber-300/10 text-amber-300">
                <LockKeyhole className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-amber-300 uppercase">
                  Protected room
                </p>
                <h2 id="join-custom-game-title" className="mt-1 text-xl font-semibold text-white">
                  {room.name}
                </h2>
              </div>
            </div>
            <button
              type="button"
              className="p-2 text-neutral-500 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
              aria-label="Close password dialog"
              disabled={submitting}
              onClick={onClose}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>

          <form className="p-6" onSubmit={submit}>
            <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
              Room password
              <input
                ref={passwordRef}
                className="h-11 border border-white/15 bg-black/45 px-3 text-sm text-white outline-none transition focus:border-sky-400"
                value={password}
                type="password"
                maxLength={64}
                autoComplete="off"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <footer className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-5">
              <Button variant="ghost" type="button" disabled={submitting} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!password || submitting}>
                {submitting ? 'Joining…' : 'Join room'}
              </Button>
            </footer>
          </form>
        </section>
      </div>
    </ModalPortal>
  )
}
