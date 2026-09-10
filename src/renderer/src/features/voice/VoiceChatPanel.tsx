import { useEffect, useState, type JSX } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  VolumeX
} from 'lucide-react'
import { useAuthStore } from '../auth/auth.store'
import { usePartyStore } from '../party/party.store'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useVoiceStore } from './voice.store'

const stateLabel = {
  disabled: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  error: 'Voice error'
} as const

const keyboardEventToVoicePttKey = (event: KeyboardEvent): string | null => {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
  if (/^F(?:[1-9]|1[0-2])$/.test(event.code)) return event.code

  const mapped: Record<string, string> = {
    Space: 'SPACE',
    ControlLeft: 'CTRL',
    ControlRight: 'CTRL',
    ShiftLeft: 'SHIFT',
    ShiftRight: 'SHIFT',
    AltLeft: 'ALT',
    AltRight: 'ALT',
    Enter: 'ENTER',
    NumpadEnter: 'ENTER',
    Tab: 'TAB',
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

  return mapped[event.code] ?? null
}

const mouseEventToVoicePttKey = (event: MouseEvent): string | null => {
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

const displayVoicePttKey = (key: string): string => (key.length === 1 ? key.toUpperCase() : key)

export function VoiceChatPanel(): JSX.Element | null {
  const playerId = useAuthStore((state) => state.session?.player.id)
  const party = usePartyStore((state) => state.party)
  const match = useMatchmakingStore((state) => state.match)
  const connectionDetails = useMatchmakingStore((state) => state.connectionDetails)
  const connectionState = useVoiceStore((state) => state.connectionState)
  const room = useVoiceStore((state) => state.room)
  const peers = useVoiceStore((state) => state.peers)
  const micMode = useVoiceStore((state) => state.micMode)
  const pttPressed = useVoiceStore((state) => state.pttPressed)
  const microphoneReady = useVoiceStore((state) => state.microphoneReady)
  const error = useVoiceStore((state) => state.error)
  const initialize = useVoiceStore((state) => state.initialize)
  const connect = useVoiceStore((state) => state.connect)
  const disconnect = useVoiceStore((state) => state.disconnect)
  const sync = useVoiceStore((state) => state.sync)
  const setMicMode = useVoiceStore((state) => state.setMicMode)
  const setPttPressed = useVoiceStore((state) => state.setPttPressed)
  const setPeerVolume = useVoiceStore((state) => state.setPeerVolume)
  const togglePeerMuted = useVoiceStore((state) => state.togglePeerMuted)
  const [minimized, setMinimized] = useState(false)
  const [voicePttKey, setVoicePttKey] = useState('k')
  const [capturingPttKey, setCapturingPttKey] = useState(false)
  const [pttKeyError, setPttKeyError] = useState<string | null>(null)

  useEffect(() => {
    if (playerId) initialize(playerId)
  }, [initialize, playerId])

  useEffect(() => {
    if (!playerId) return
    void sync().catch(() => undefined)
  }, [connectionDetails?.matchId, match?.matchId, party?.id, party?.members.length, playerId, sync])

  useEffect(() => {
    let active = true
    void window.api.gameSettings
      .get()
      .then((settings) => {
        if (active) setVoicePttKey(settings.voicePttKey)
      })
      .catch((loadError: unknown) => {
        if (active) {
          setPttKeyError(
            loadError instanceof Error ? loadError.message : 'Could not load the push-to-talk key.'
          )
        }
      })
    return () => {
      active = false
    }
  }, [])

  const voiceActive = connectionState !== 'disabled' && connectionState !== 'disconnected'

  useEffect(() => {
    if (micMode !== 'push_to_talk' || !voiceActive || capturingPttKey) {
      setPttPressed(false)
      return
    }

    const matchesConfiguredKey = (candidate: string | null): boolean =>
      candidate !== null && candidate.toLowerCase() === voicePttKey.toLowerCase()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.repeat && matchesConfiguredKey(keyboardEventToVoicePttKey(event))) {
        setPttPressed(true)
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (matchesConfiguredKey(keyboardEventToVoicePttKey(event))) setPttPressed(false)
    }
    const onMouseDown = (event: MouseEvent): void => {
      if (matchesConfiguredKey(mouseEventToVoicePttKey(event))) setPttPressed(true)
    }
    const onMouseUp = (event: MouseEvent): void => {
      if (matchesConfiguredKey(mouseEventToVoicePttKey(event))) setPttPressed(false)
    }
    const onBlur = (): void => setPttPressed(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('blur', onBlur)
      setPttPressed(false)
    }
  }, [capturingPttKey, micMode, setPttPressed, voiceActive, voicePttKey])

  useEffect(() => {
    if (!capturingPttKey) return

    const saveKey = (key: string): void => {
      setCapturingPttKey(false)
      setPttKeyError(null)
      void window.api.gameSettings
        .setVoicePttKey(key)
        .then((settings) => setVoicePttKey(settings.voicePttKey))
        .catch((saveError: unknown) =>
          setPttKeyError(
            saveError instanceof Error ? saveError.message : 'Could not save the push-to-talk key.'
          )
        )
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setCapturingPttKey(false)
        return
      }
      const key = keyboardEventToVoicePttKey(event)
      if (key) saveKey(key)
    }

    const onMouseDown = (event: MouseEvent): void => {
      const key = mouseEventToVoicePttKey(event)
      if (!key) return
      event.preventDefault()
      event.stopPropagation()
      saveKey(key)
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mousedown', onMouseDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mousedown', onMouseDown, true)
    }
  }, [capturingPttKey])

  if (!playerId) return null
  const hasVoiceContext = Boolean(room || match || connectionDetails || (party && party.members.length > 1))
  if (!hasVoiceContext && connectionState !== 'error') return null

  const title = room?.scope === 'match_team' ? 'Team Voice' : 'Party Voice'
  const active = voiceActive
  const displayedPttKey = displayVoicePttKey(voicePttKey)

  return (
    <aside className="fixed right-5 bottom-5 z-[80] w-[min(25rem,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-white/15 bg-neutral-950/95 text-white shadow-2xl backdrop-blur">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span
          className={`size-2 rounded-full ${connectionState === 'connected' ? 'bg-emerald-400' : 'bg-neutral-500'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-[11px] text-neutral-400">
            {stateLabel[connectionState]}
            {room ? ` · ${peers.length} ${peers.length === 1 ? 'player' : 'players'}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white"
          aria-label={minimized ? 'Expand voice chat' : 'Minimize voice chat'}
          onClick={() => setMinimized((value) => !value)}
        >
          {minimized ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </header>

      {!minimized && (
        <div className="p-4">
          <div className="flex items-center gap-2">
            {active ? (
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/20"
                onClick={() => void disconnect()}
              >
                <PhoneOff size={15} /> Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/20"
                onClick={() => void connect()}
              >
                <PhoneCall size={15} /> Reconnect
              </button>
            )}

            <button
              type="button"
              disabled={!active}
              className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-200 disabled:opacity-50"
              onClick={() => setMicMode(micMode === 'open_mic' ? 'push_to_talk' : 'open_mic')}
            >
              {micMode === 'open_mic' ? <Mic size={15} /> : <MicOff size={15} />}
              {micMode === 'open_mic' ? 'Open mic' : 'Push to talk'}
            </button>
          </div>

          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-neutral-200">Push-to-talk key</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  The same key is synced to Counter-Strike.
                </p>
              </div>
              <kbd className="min-w-12 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-center font-mono text-xs font-semibold text-white">
                {capturingPttKey ? '...' : displayedPttKey}
              </kbd>
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-200 hover:bg-white/10"
                onClick={() => {
                  setPttKeyError(null)
                  setCapturingPttKey((value) => !value)
                }}
              >
                {capturingPttKey ? 'Cancel' : 'Change'}
              </button>
            </div>
            {capturingPttKey && (
              <p className="mt-2 text-[11px] text-sky-300">
                Press a keyboard key or MOUSE1-MOUSE5. Escape cancels.
              </p>
            )}
            {micMode === 'push_to_talk' && active && !capturingPttKey && (
              <p className={`mt-2 text-[11px] ${pttPressed ? 'text-emerald-300' : 'text-neutral-500'}`}>
                {pttPressed ? 'Transmitting voice' : `Hold ${displayedPttKey} to talk`}
              </p>
            )}
            {pttKeyError && <p className="mt-2 text-[11px] text-red-300">{pttKeyError}</p>}
          </div>

          {active && !microphoneReady && room && peers.length > 0 && (
            <p className="mt-3 text-xs text-amber-300">Waiting for microphone permission…</p>
          )}

          {peers.length > 0 ? (
            <div className="mt-4 space-y-3">
              {peers.map((peer) => (
                <div key={peer.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${peer.state === 'connected' ? 'bg-emerald-400' : 'bg-neutral-600'}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{peer.username}</span>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white"
                      aria-label={peer.muted ? `Unmute ${peer.username}` : `Mute ${peer.username}`}
                      onClick={() => togglePeerMuted(peer.id)}
                    >
                      {peer.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      className="h-1.5 flex-1 cursor-pointer accent-sky-400"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(peer.volume * 100)}
                      aria-label={`${peer.username} volume`}
                      onChange={(event) => setPeerVolume(peer.id, Number(event.target.value) / 100)}
                    />
                    <span className="w-9 text-right font-mono text-[11px] text-neutral-400">
                      {Math.round(peer.volume * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-neutral-400">
              {room ? 'Waiting for another player to join voice.' : 'Voice will join when a party or match room is available.'}
            </p>
          )}

          {micMode === 'push_to_talk' && active && (
            <p className="mt-3 text-[11px] text-neutral-500">
              {room?.scope === 'match_team'
                ? `Counter-Strike ${displayedPttKey} controls this mic while you are in game.`
                : `The launcher listens for ${displayedPttKey} while it is focused.`}
            </p>
          )}
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </aside>
  )
}
