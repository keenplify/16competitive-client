import { Mic2, MicOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type {
  MatchmakingEvent,
  VoiceContext,
  VoicePeer,
  VoiceSignalType
} from '../../../../shared/matchmaking'
import { useAuthStore } from '../auth/auth.store'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { usePartyStore } from '../party/party.store'

interface PeerRuntime {
  peer: VoicePeer
  connection: RTCPeerConnection
  audio: HTMLAudioElement
  pendingIce: RTCIceCandidateInit[]
}

interface PeerPreference {
  volume: number
  muted: boolean
}

interface NativePttSignal {
  type: 'ptt'
  active: boolean
}

type RailMode = 'expanded' | 'collapsed' | 'absent'

const VOICE_PREFERENCES_KEY = '16competitive.voice.preferences'
const OPEN_MIC_KEY = '16competitive.voice.open-mic'
const VOICE_PTT_KEY_CHANGED_EVENT = '16competitive:voice-ptt-key-changed'
const NATIVE_PTT_SIGNAL_PLAYER_ID = '__16competitive_ptt__'
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
]

const sameContext = (left: VoiceContext | null, right: VoiceContext | null): boolean =>
  Boolean(left && right && left.kind === right.kind && left.id === right.id)

const normalizeGoldSrcKey = (key: string): string => key.trim().toUpperCase()

const keyboardEventGoldSrcKey = (event: KeyboardEvent): string | null => {
  if (event.code.startsWith('Key') && event.code.length === 4) return event.code.slice(3).toUpperCase()
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
  const named = byCode[event.code]
  if (named) return named
  return event.key.length === 1 ? event.key.toUpperCase() : null
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

const loadPeerPreferences = (): Record<string, PeerPreference> => {
  try {
    const value = localStorage.getItem(VOICE_PREFERENCES_KEY)
    if (!value) return {}
    const parsed = JSON.parse(value) as Record<string, Partial<PeerPreference>>
    return Object.fromEntries(
      Object.entries(parsed).map(([playerId, preference]) => [
        playerId,
        {
          volume:
            typeof preference.volume === 'number'
              ? Math.max(0, Math.min(1, preference.volume))
              : 1,
          muted: preference.muted === true
        }
      ])
    )
  } catch {
    return {}
  }
}

const savePeerPreferences = (preferences: Record<string, PeerPreference>): void => {
  localStorage.setItem(VOICE_PREFERENCES_KEY, JSON.stringify(preferences))
}

const parseSignal = <T,>(signal: string): T | null => {
  try {
    return JSON.parse(signal) as T
  } catch {
    return null
  }
}

const microphoneErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone permission is blocked. Allow microphone access, then reconnect voice.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone was found.'
  }
  return error instanceof Error ? error.message : 'Could not access the microphone.'
}

export function VoiceChatDock(): JSX.Element | null {
  const currentPlayerId = useAuthStore((state) => state.session?.player.id ?? null)
  const party = usePartyStore((state) => state.party)
  const connectionStatus = useMatchmakingStore((state) => state.connectionStatus)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const connectionDetails = useMatchmakingStore((state) => state.connectionDetails)

  const desiredContext = useMemo<VoiceContext | null>(() => {
    if (!currentPlayerId) return null
    if (queueStatus === 'server_ready' && connectionDetails) {
      return { kind: 'match', id: connectionDetails.matchId }
    }
    if (party) return { kind: 'party', id: party.id }
    return null
  }, [connectionDetails, currentPlayerId, party, queueStatus])

  const [enabled, setEnabled] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [joinedContext, setJoinedContext] = useState<VoiceContext | null>(null)
  const [peers, setPeers] = useState<VoicePeer[]>([])
  const [peerStates, setPeerStates] = useState<Record<string, RTCPeerConnectionState>>({})
  const [preferences, setPreferences] = useState<Record<string, PeerPreference>>(loadPeerPreferences)
  const [openMic, setOpenMic] = useState(() => localStorage.getItem(OPEN_MIC_KEY) === 'true')
  const [pttActive, setPttActive] = useState(false)
  const [voicePttKey, setVoicePttKey] = useState('K')
  const [micError, setMicError] = useState<string | null>(null)
  const [micReady, setMicReady] = useState(false)
  const [railMode, setRailMode] = useState<RailMode>('absent')

  const streamRef = useRef<MediaStream | null>(null)
  const microphonePromiseRef = useRef<Promise<MediaStream> | null>(null)
  const microphoneGenerationRef = useRef(0)
  const runtimesRef = useRef(new Map<string, PeerRuntime>())
  const contextRef = useRef<VoiceContext | null>(null)
  const playerIdRef = useRef<string | null>(currentPlayerId)
  const openMicRef = useRef(openMic)
  const pttActiveRef = useRef(pttActive)
  const peersRef = useRef(peers)
  const preferencesRef = useRef(preferences)
  const activeContext = joinedContext ?? desiredContext

  useEffect(() => {
    playerIdRef.current = currentPlayerId
  }, [currentPlayerId])

  useEffect(() => {
    peersRef.current = peers
  }, [peers])

  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

  useEffect(() => {
    contextRef.current = joinedContext
  }, [joinedContext])

  useEffect(() => {
    openMicRef.current = openMic
    localStorage.setItem(OPEN_MIC_KEY, String(openMic))
    const track = streamRef.current?.getAudioTracks()[0]
    if (track) track.enabled = openMic || pttActiveRef.current
  }, [openMic])

  useEffect(() => {
    pttActiveRef.current = pttActive
    const track = streamRef.current?.getAudioTracks()[0]
    if (track) track.enabled = openMicRef.current || pttActive
  }, [pttActive])

  useEffect(() => {
    const detectRail = (): void => {
      const rail = document.querySelector<HTMLElement>(
        'aside[aria-label="Friends panel"], aside[aria-label="Expand Friends panel"]'
      )
      if (!rail) {
        setRailMode('absent')
        return
      }
      setRailMode(rail.getAttribute('aria-label') === 'Expand Friends panel' ? 'collapsed' : 'expanded')
    }

    detectRail()
    const observer = new MutationObserver(detectRail)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label']
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!currentPlayerId) {
      setVoicePttKey('K')
      return
    }

    void window.api.gameSettings
      .get()
      .then((settings) => {
        if (!cancelled) setVoicePttKey(normalizeGoldSrcKey(settings.voicePttKey))
      })
      .catch(() => undefined)

    const keyChanged = (event: Event): void => {
      const key = (event as CustomEvent<unknown>).detail
      if (typeof key === 'string' && key.trim()) {
        setVoicePttKey(normalizeGoldSrcKey(key))
        setPttActive(false)
      }
    }
    window.addEventListener(VOICE_PTT_KEY_CHANGED_EVENT, keyChanged)

    return () => {
      cancelled = true
      window.removeEventListener(VOICE_PTT_KEY_CHANGED_EVENT, keyChanged)
    }
  }, [currentPlayerId])

  useEffect(() => {
    if (!enabled || openMic || activeContext?.kind !== 'party' || !voicePttKey) return

    const configuredKey = normalizeGoldSrcKey(voicePttKey)
    const keyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return
      const key = keyboardEventGoldSrcKey(event)
      if (key && normalizeGoldSrcKey(key) === configuredKey) setPttActive(true)
    }
    const keyUp = (event: KeyboardEvent): void => {
      const key = keyboardEventGoldSrcKey(event)
      if (key && normalizeGoldSrcKey(key) === configuredKey) setPttActive(false)
    }
    const mouseDown = (event: MouseEvent): void => {
      const key = mouseEventGoldSrcKey(event)
      if (key && key === configuredKey) setPttActive(true)
    }
    const mouseUp = (event: MouseEvent): void => {
      const key = mouseEventGoldSrcKey(event)
      if (key && key === configuredKey) setPttActive(false)
    }
    const reset = (): void => setPttActive(false)

    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('mousedown', mouseDown)
    window.addEventListener('mouseup', mouseUp)
    window.addEventListener('blur', reset)

    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('mousedown', mouseDown)
      window.removeEventListener('mouseup', mouseUp)
      window.removeEventListener('blur', reset)
      reset()
    }
  }, [activeContext?.kind, enabled, openMic, voicePttKey])

  const preferenceFor = (playerId: string): PeerPreference =>
    preferences[playerId] ?? { volume: 1, muted: false }

  const runtimePreferenceFor = (playerId: string): PeerPreference =>
    preferencesRef.current[playerId] ?? { volume: 1, muted: false }

  const applyPreference = (runtime: PeerRuntime, preference: PeerPreference): void => {
    runtime.audio.volume = preference.muted ? 0 : preference.volume
  }

  const updatePreference = (playerId: string, next: PeerPreference): void => {
    setPreferences((current) => {
      const updated = { ...current, [playerId]: next }
      preferencesRef.current = updated
      savePeerPreferences(updated)
      const runtime = runtimesRef.current.get(playerId)
      if (runtime) applyPreference(runtime, next)
      return updated
    })
  }

  const closePeer = (playerId: string): void => {
    const runtime = runtimesRef.current.get(playerId)
    if (!runtime) return
    runtime.connection.close()
    runtime.audio.pause()
    runtime.audio.srcObject = null
    runtime.audio.remove()
    runtimesRef.current.delete(playerId)
    setPeerStates((current) => {
      const next = { ...current }
      delete next[playerId]
      return next
    })
  }

  const closeAllPeers = (): void => {
    for (const playerId of [...runtimesRef.current.keys()]) closePeer(playerId)
    setPeers([])
  }

  const stopMicrophone = (): void => {
    microphoneGenerationRef.current += 1
    microphonePromiseRef.current = null
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    setMicReady(false)
  }

  const ensureMicrophone = async (): Promise<MediaStream> => {
    if (streamRef.current) return streamRef.current
    if (microphonePromiseRef.current) return microphonePromiseRef.current

    const generation = microphoneGenerationRef.current
    const request = navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
      .then((stream) => {
        if (generation !== microphoneGenerationRef.current) {
          for (const track of stream.getTracks()) track.stop()
          throw new Error('Voice microphone request was cancelled.')
        }
        const track = stream.getAudioTracks()[0]
        if (track) track.enabled = openMicRef.current || pttActiveRef.current
        streamRef.current = stream
        setMicReady(true)
        setMicError(null)
        return stream
      })
      .catch((error: unknown) => {
        if (generation === microphoneGenerationRef.current) {
          setMicReady(false)
          setMicError(microphoneErrorMessage(error))
        }
        throw error
      })

    microphonePromiseRef.current = request
    try {
      return await request
    } finally {
      if (microphonePromiseRef.current === request) microphonePromiseRef.current = null
    }
  }

  const sendSignal = async (
    targetPlayerId: string,
    signalType: VoiceSignalType,
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit
  ): Promise<void> => {
    await window.api.matchmaking.voiceSignal(targetPlayerId, signalType, JSON.stringify(payload))
  }

  const ensurePeer = async (peer: VoicePeer): Promise<PeerRuntime> => {
    const existing = runtimesRef.current.get(peer.id)
    if (existing) return existing

    const stream = await ensureMicrophone()
    const existingAfterMicrophone = runtimesRef.current.get(peer.id)
    if (existingAfterMicrophone) return existingAfterMicrophone

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.hidden = true
    document.body.appendChild(audio)
    const runtime: PeerRuntime = { peer, connection, audio, pendingIce: [] }
    runtimesRef.current.set(peer.id, runtime)
    applyPreference(runtime, runtimePreferenceFor(peer.id))

    for (const track of stream.getTracks()) connection.addTrack(track, stream)

    connection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return
      void sendSignal(peer.id, 'ice', event.candidate.toJSON()).catch(() => undefined)
    })
    connection.addEventListener('track', (event) => {
      const [remoteStream] = event.streams
      if (remoteStream) runtime.audio.srcObject = remoteStream
      void runtime.audio.play().catch(() => undefined)
    })
    connection.addEventListener('connectionstatechange', () => {
      setPeerStates((current) => ({ ...current, [peer.id]: connection.connectionState }))
      if (connection.connectionState !== 'failed') return
      connection.restartIce()
      const currentPlayer = playerIdRef.current
      if (currentPlayer && currentPlayer < peer.id) {
        window.setTimeout(() => void makeOffer(peer).catch(() => undefined), 100)
      }
    })

    setPeerStates((current) => ({ ...current, [peer.id]: connection.connectionState }))
    return runtime
  }

  const makeOffer = async (peer: VoicePeer): Promise<void> => {
    const currentPlayer = playerIdRef.current
    if (!currentPlayer || currentPlayer >= peer.id) return
    const runtime = await ensurePeer(peer)
    if (runtime.connection.signalingState !== 'stable') return
    const offer = await runtime.connection.createOffer()
    await runtime.connection.setLocalDescription(offer)
    await sendSignal(peer.id, 'offer', offer)
  }

  const flushPendingIce = async (runtime: PeerRuntime): Promise<void> => {
    if (!runtime.connection.remoteDescription) return
    const pending = runtime.pendingIce.splice(0)
    for (const candidate of pending) {
      await runtime.connection.addIceCandidate(candidate).catch(() => undefined)
    }
  }

  useEffect(() => {
    const removeListener = window.api.matchmaking.onEvent((event: MatchmakingEvent) => {
      if (event.type === 'authenticated' && enabled && desiredContext) {
        void window.api.matchmaking.voiceJoin(desiredContext).catch(() => undefined)
        return
      }
      if (event.type === 'voice_session') {
        if (!enabled || !desiredContext || !sameContext(event.context, desiredContext)) return
        setJoinedContext(event.context)
        setPeers(event.peers)
        for (const peer of event.peers) void makeOffer(peer).catch(() => undefined)
        return
      }
      if (event.type === 'voice_peer_joined') {
        if (!enabled || !desiredContext || !sameContext(event.context, desiredContext)) return
        setPeers((current) =>
          current.some(({ id }) => id === event.peer.id) ? current : [...current, event.peer]
        )
        void makeOffer(event.peer).catch(() => undefined)
        return
      }
      if (event.type === 'voice_peer_left') {
        if (!sameContext(event.context, contextRef.current)) return
        closePeer(event.playerId)
        setPeers((current) => current.filter(({ id }) => id !== event.playerId))
        return
      }
      if (event.type !== 'voice_signal') return
      if (!enabled || !desiredContext || !sameContext(event.context, desiredContext)) return

      if (event.fromPlayerId === NATIVE_PTT_SIGNAL_PLAYER_ID) {
        const nativePtt = parseSignal<NativePttSignal>(event.signal)
        if (nativePtt?.type === 'ptt' && typeof nativePtt.active === 'boolean') {
          setPttActive(nativePtt.active)
        }
        return
      }

      const peer = peersRef.current.find(({ id }) => id === event.fromPlayerId) ?? {
        id: event.fromPlayerId,
        username: 'Teammate'
      }
      void (async () => {
        const runtime = await ensurePeer(peer)
        if (event.signalType === 'offer') {
          const offer = parseSignal<RTCSessionDescriptionInit>(event.signal)
          if (!offer) return
          await runtime.connection.setRemoteDescription(offer)
          await flushPendingIce(runtime)
          const answer = await runtime.connection.createAnswer()
          await runtime.connection.setLocalDescription(answer)
          await sendSignal(peer.id, 'answer', answer)
          return
        }
        if (event.signalType === 'answer') {
          const answer = parseSignal<RTCSessionDescriptionInit>(event.signal)
          if (!answer) return
          await runtime.connection.setRemoteDescription(answer)
          await flushPendingIce(runtime)
          return
        }
        const candidate = parseSignal<RTCIceCandidateInit>(event.signal)
        if (!candidate) return
        if (!runtime.connection.remoteDescription) {
          runtime.pendingIce.push(candidate)
          return
        }
        await runtime.connection.addIceCandidate(candidate).catch(() => undefined)
      })().catch(() => undefined)
    })

    return removeListener
  }, [desiredContext, enabled])

  useEffect(() => {
    if (!enabled || !desiredContext || connectionStatus !== 'ready') {
      if (joinedContext) void window.api.matchmaking.voiceLeave().catch(() => undefined)
      setPttActive(false)
      closeAllPeers()
      stopMicrophone()
      setJoinedContext(null)
      return
    }

    if (!sameContext(joinedContext, desiredContext)) {
      setPttActive(false)
      closeAllPeers()
      stopMicrophone()
      setJoinedContext(null)
      void window.api.matchmaking
        .voiceJoin(desiredContext)
        .catch((error: unknown) =>
          setMicError(error instanceof Error ? error.message : 'Could not join voice chat.')
        )
    }
  }, [connectionStatus, desiredContext, enabled, joinedContext])

  useEffect(
    () => () => {
      for (const runtime of runtimesRef.current.values()) {
        runtime.connection.close()
        runtime.audio.remove()
      }
      runtimesRef.current.clear()
      microphoneGenerationRef.current += 1
      for (const track of streamRef.current?.getTracks() ?? []) track.stop()
      streamRef.current = null
      microphonePromiseRef.current = null
      void window.api.matchmaking.voiceLeave().catch(() => undefined)
    },
    []
  )

  if (!desiredContext && !joinedContext) return null

  const contextLabel = activeContext?.kind === 'match' ? 'Team voice' : 'Party voice'
  const connectedPeers = peers.filter(({ id }) => peerStates[id] === 'connected').length
  const configuredPttAvailable = Boolean(voicePttKey)

  const disconnect = (): void => {
    setEnabled(false)
    setPttActive(false)
    void window.api.matchmaking.voiceLeave().catch(() => undefined)
    closeAllPeers()
    stopMicrophone()
    setJoinedContext(null)
  }

  const reconnect = (): void => {
    setEnabled(true)
    setMicError(null)
  }

  if (railMode === 'collapsed' && !expanded) {
    return (
      <button
        type="button"
        className={`fixed right-0 bottom-5 z-[70] grid h-11 w-11 place-items-center border-y border-l bg-neutral-950/95 shadow-xl backdrop-blur transition-colors ${
          enabled
            ? pttActive
              ? 'border-sky-400/60 text-sky-300'
              : 'border-white/15 text-neutral-300 hover:bg-neutral-900 hover:text-white'
            : 'border-red-400/30 text-red-300'
        }`}
        title={`${contextLabel}: ${enabled ? `${connectedPeers}/${peers.length} connected` : 'disconnected'}`}
        aria-label={`Open ${contextLabel.toLowerCase()} controls`}
        onClick={() => setExpanded(true)}
      >
        {enabled ? <Mic2 className="size-4" aria-hidden="true" /> : <MicOff className="size-4" aria-hidden="true" />}
        {enabled && peers.length > 0 && (
          <span
            className={`absolute right-1 bottom-1 size-1.5 rounded-full ${
              connectedPeers > 0 ? 'bg-emerald-400' : 'bg-amber-300'
            }`}
            aria-hidden="true"
          />
        )}
      </button>
    )
  }

  const dockPosition =
    railMode === 'expanded'
      ? 'right-0 bottom-0 w-72 rounded-none border-r-0 border-b-0'
      : railMode === 'collapsed'
        ? 'right-12 bottom-5 w-[min(24rem,calc(100vw-4.5rem))] rounded-xl'
        : 'right-5 top-24 w-[min(24rem,calc(100vw-2.5rem))] rounded-xl'

  return (
    <aside
      className={`fixed z-[70] overflow-hidden border border-white/15 bg-neutral-950/95 text-white shadow-2xl backdrop-blur ${dockPosition}`}
      aria-label={contextLabel}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/5"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full ${
              enabled ? (pttActive ? 'bg-sky-400/20 text-sky-300' : 'bg-white/5 text-neutral-300') : 'bg-red-400/10 text-red-300'
            }`}
          >
            {enabled ? <Mic2 className="size-3.5" aria-hidden="true" /> : <MicOff className="size-3.5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{contextLabel}</p>
            <p className="truncate text-xs text-neutral-400">
              {enabled
                ? `${connectedPeers}/${peers.length} connected${openMic ? ' · Open mic' : pttActive ? ' · Talking' : ''}`
                : 'Disconnected'}
            </p>
          </div>
        </div>
        <span className="text-lg text-neutral-400">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="max-h-[65vh] overflow-y-auto border-t border-white/10 p-4">
          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <button
                  type="button"
                  className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                    openMic
                      ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                      : 'border-white/15 bg-white/5 text-neutral-200'
                  }`}
                  onClick={() => setOpenMic((value) => !value)}
                >
                  Open mic {openMic ? 'on' : 'off'}
                </button>
                {!openMic && (
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                      pttActive
                        ? 'border-sky-400/60 bg-sky-400/20 text-sky-100'
                        : 'border-white/15 bg-white/5 text-neutral-200'
                    }`}
                    onPointerDown={() => setPttActive(true)}
                    onPointerUp={() => setPttActive(false)}
                    onPointerCancel={() => setPttActive(false)}
                    onPointerLeave={() => setPttActive(false)}
                  >
                    {configuredPttAvailable ? 'PTT test' : 'Hold to talk'}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200"
                  onClick={disconnect}
                >
                  Disconnect voice
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200"
                onClick={reconnect}
              >
                Reconnect voice
              </button>
            )}
          </div>

          {enabled && !openMic && activeContext?.kind === 'match' && (
            <p className="mt-3 text-xs text-neutral-400">
              Hold <span className="font-mono text-neutral-200">{voicePttKey}</span> in Counter-Strike to talk.
            </p>
          )}
          {enabled && !openMic && activeContext?.kind === 'party' && (
            <p className="mt-3 text-xs text-neutral-400">
              Hold <span className="font-mono text-neutral-200">{voicePttKey}</span> to talk while the launcher is focused.
            </p>
          )}

          {enabled && (
            <div className="mt-4 space-y-3">
              {peers.length === 0 && (
                <p className="text-xs text-neutral-500">Waiting for another player in voice chat.</p>
              )}
              {peers.map((peer) => {
                const preference = preferenceFor(peer.id)
                const state = peerStates[peer.id] ?? 'new'
                return (
                  <div key={peer.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{peer.username}</p>
                        <p className="text-[11px] text-neutral-500">{state}</p>
                      </div>
                      <button
                        type="button"
                        className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:bg-white/5"
                        onClick={() =>
                          updatePreference(peer.id, { ...preference, muted: !preference.muted })
                        }
                      >
                        {preference.muted ? 'Unmute' : 'Mute'}
                      </button>
                    </div>
                    <label className="mt-2 flex items-center gap-3 text-xs text-neutral-400">
                      <span className="w-10">{Math.round(preference.volume * 100)}%</span>
                      <input
                        className="min-w-0 flex-1 accent-sky-400"
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(preference.volume * 100)}
                        disabled={preference.muted}
                        onChange={(event) =>
                          updatePreference(peer.id, {
                            ...preference,
                            volume: Number(event.target.value) / 100
                          })
                        }
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          )}

          {!micReady && enabled && !micError && (
            <p className="mt-3 text-xs text-neutral-500">
              Microphone permission will be requested when another player joins voice.
            </p>
          )}
          {micError && <p className="mt-3 text-xs text-red-300">{micError}</p>}
        </div>
      )}
    </aside>
  )
}
