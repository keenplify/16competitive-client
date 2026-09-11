import { useEffect, useRef, useState, type JSX } from 'react'
import { Mic2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'

export const VOICE_PTT_KEY_CHANGED_EVENT = '16competitive:voice-ptt-key-changed'

type VoiceTalkChannel = 'team' | 'party'

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
  const [teamPttKey, setTeamPttKey] = useState('K')
  const [partyPttKey, setPartyPttKey] = useState('V')
  const [hasGame, setHasGame] = useState(false)
  const [capturing, setCapturing] = useState<VoiceTalkChannel | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.gameSettings
      .get()
      .then((settings) => {
        if (cancelled) return
        setTeamPttKey(settings.voicePttKeys[0] ?? settings.voicePttKey)
        setPartyPttKey(settings.voicePttKeys[1] ?? 'V')
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
      const channel = capturing
      setCapturing(null)
      setSaving(true)
      setError(null)
      setNotice(null)
      const value = channel === 'party' ? `party:${key}` : key
      void window.api.gameSettings
        .setVoicePttKey(value)
        .then((settings) => {
          const nextTeamKey = settings.voicePttKeys[0] ?? settings.voicePttKey
          const nextPartyKey = settings.voicePttKeys[1] ?? 'V'
          setTeamPttKey(nextTeamKey)
          setPartyPttKey(nextPartyKey)
          setHasGame(Boolean(settings.cs16ExecutablePath))
          window.dispatchEvent(
            new CustomEvent(VOICE_PTT_KEY_CHANGED_EVENT, {
              detail: {
                channel,
                key: channel === 'team' ? nextTeamKey : nextPartyKey
              }
            })
          )
          setNotice(
            `${channel === 'team' ? 'Team' : 'Party'} push-to-talk is now ${
              channel === 'team' ? nextTeamKey : nextPartyKey
            }.`
          )
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

  const bindingRow = (channel: VoiceTalkChannel, key: string): JSX.Element => (
    <div className="flex flex-col gap-3 border-t border-white/10 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-white">
          {channel === 'team' ? 'Team talk' : 'Party talk'}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {channel === 'team'
            ? 'Talk to every human teammate in your current match.'
            : 'Talk only to party members who are also on your current team.'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <kbd className="grid min-w-20 place-items-center border border-white/20 bg-black/40 px-4 py-2 font-mono text-sm font-semibold text-white">
          {key}
        </kbd>
        <Button
          variant="ghost"
          data-ptt-capture-control
          disabled={saving}
          onClick={() => {
            setCapturing((value) => (value === channel ? null : channel))
            setError(null)
            setNotice(null)
          }}
        >
          {capturing === channel ? 'Cancel' : saving ? 'Saving…' : 'Change'}
        </Button>
      </div>
    </div>
  )

  return (
    <div ref={panelRef} className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Mic2 className="size-5 text-sky-400" aria-hidden="true" />
          <h3 className="text-lg font-semibold">Push-to-talk</h3>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Team and Party talk use separate keys. Team defaults to K and Party defaults to V.
          Counter-Strike receives both bindings temporarily when a match launches.
        </p>
      </div>

      <div className="mt-4">
        {bindingRow('team', teamPttKey)}
        {bindingRow('party', partyPttKey)}
      </div>

      {capturing && (
        <div className="mt-2 border border-sky-400/25 bg-sky-400/5 p-4 text-sm text-sky-200">
          Press a keyboard key, or click with MOUSE1 through MOUSE5 anywhere in this panel for{' '}
          {capturing === 'team' ? 'Team' : 'Party'} talk.
        </div>
      )}

      <div className="mt-3 min-h-5 text-xs" aria-live="polite">
        {notice && <p className="text-emerald-300">{notice}</p>}
        {error && <p className="text-red-400">{error}</p>}
        {!notice && !error && (
          <p className="text-neutral-500">
            {hasGame
              ? 'Your previous Counter-Strike bindings are restored after the match.'
              : 'Choose your Counter-Strike executable to launch matches.'}
          </p>
        )}
      </div>
    </div>
  )
}
