import { useEffect, useRef, useState, type JSX } from 'react'
import { Mic2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'

export const VOICE_PTT_KEY_CHANGED_EVENT = '16competitive:voice-ptt-key-changed'

const keyboardEventGoldSrcKey = (event: KeyboardEvent): string | null => {
  if (event.code.startsWith('Key') && event.code.length === 4)
    return event.code.slice(3).toUpperCase()
  if (event.code.startsWith('Digit') && event.code.length === 6) return event.code.slice(5)
  if (/^F(?:[1-9]|1[0-2])$/.test(event.code)) return event.code

  const byCode: Record<string, string> = {
    Space: 'SPACE',
    ControlLeft: 'CTRL',
    ControlRight: 'CTRL',
    ShiftLeft: 'SHIFT',
    ShiftRight: 'SHIFT',
    AltLeft: 'ALT',
    AltRight: 'ALT',
    Enter: 'ENTER',
    Tab: 'TAB',
    Escape: 'ESCAPE',
    Backspace: 'BACKSPACE',
    ArrowUp: 'UPARROW',
    ArrowDown: 'DOWNARROW',
    ArrowLeft: 'LEFTARROW',
    ArrowRight: 'RIGHTARROW',
    Insert: 'INS',
    Delete: 'DEL',
    Home: 'HOME',
    End: 'END',
    PageUp: 'PGUP',
    PageDown: 'PGDN'
  }
  return byCode[event.code] ?? null
}

const mouseEventGoldSrcKey = (event: MouseEvent): string | null => {
  switch (event.button) {
    case 0:
      return 'MOUSE1'
    case 2:
      return 'MOUSE2'
    case 1:
      return 'MOUSE3'
    case 3:
      return 'MOUSE4'
    case 4:
      return 'MOUSE5'
    default:
      return null
  }
}

const readableError = (error: unknown): string =>
  error instanceof Error
    ? error.message.replace(/^Error invoking remote method '.+?': Error: /, '')
    : 'Could not save the push-to-talk key.'

export function VoicePttKeySetting(): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pttKey, setPttKey] = useState('K')
  const [hasGame, setHasGame] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.gameSettings
      .get()
      .then((settings) => {
        if (cancelled) return
        setPttKey(settings.voicePttKey)
        setHasGame(Boolean(settings.cs16ExecutablePath))
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(readableError(loadError))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!capturing) return

    const saveKey = (key: string): void => {
      setCapturing(false)
      setSaving(true)
      setError(null)
      setNotice(null)
      void window.api.gameSettings
        .setVoicePttKey(key)
        .then((settings) => {
          setPttKey(settings.voicePttKey)
          setHasGame(Boolean(settings.cs16ExecutablePath))
          window.dispatchEvent(
            new CustomEvent(VOICE_PTT_KEY_CHANGED_EVENT, { detail: settings.voicePttKey })
          )
          setNotice(`Launcher push-to-talk is now ${settings.voicePttKey}.`)
        })
        .catch((saveError: unknown) => setError(readableError(saveError)))
        .finally(() => setSaving(false))
    }

    const keyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return
      const key = keyboardEventGoldSrcKey(event)
      if (!key) return
      event.preventDefault()
      event.stopPropagation()
      saveKey(key)
    }

    const mouseDown = (event: MouseEvent): void => {
      const panel = panelRef.current
      const target = event.target
      if (!panel || !(target instanceof Node) || !panel.contains(target)) return
      if (target instanceof Element && target.closest('[data-ptt-capture-control]')) return
      const key = mouseEventGoldSrcKey(event)
      if (!key) return
      event.preventDefault()
      event.stopPropagation()
      saveKey(key)
    }

    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('mousedown', mouseDown, true)
    return () => {
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('mousedown', mouseDown, true)
    }
  }, [capturing])

  return (
    <div ref={panelRef} className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mic2 className="size-5 text-sky-400" aria-hidden="true" />
            <h3 className="text-lg font-semibold">Push-to-talk</h3>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            This key controls party voice in the launcher and team voice during matches.
            Counter-Strike receives it temporarily when a match launches.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <kbd className="grid min-w-20 place-items-center border border-white/20 bg-black/40 px-4 py-2 font-mono text-sm font-semibold text-white">
            {pttKey}
          </kbd>
          <Button
            variant="ghost"
            data-ptt-capture-control
            disabled={saving}
            onClick={() => {
              setCapturing((value) => !value)
              setError(null)
              setNotice(null)
            }}
          >
            {capturing ? 'Cancel' : saving ? 'Saving…' : 'Change'}
          </Button>
        </div>
      </div>

      {capturing && (
        <div className="mt-4 border border-sky-400/25 bg-sky-400/5 p-4 text-sm text-sky-200">
          Press a keyboard key, or click with MOUSE1 through MOUSE5 anywhere in this panel.
        </div>
      )}

      <div className="mt-3 min-h-5 text-xs" aria-live="polite">
        {notice && <p className="text-emerald-300">{notice}</p>}
        {error && <p className="text-red-400">{error}</p>}
        {!notice && !error && (
          <p className="text-neutral-500">
            {hasGame
              ? 'Your previous Counter-Strike binding is restored after the match.'
              : 'Choose your Counter-Strike executable to launch matches.'}
          </p>
        )}
      </div>
    </div>
  )
}
