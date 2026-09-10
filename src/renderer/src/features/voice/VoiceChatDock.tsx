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

const VOICE_PREFERENCES_KEY = '16competitive.voice.preferences'
const OPEN_MIC_KEY = '16competitive.voice.open-mic'
const NATIVE_PTT_SIGNAL_PLAYER_ID = '__16competitive_ptt__'
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
]

const sameContext = (left: VoiceContext | null, right: VoiceContext | null): boolean =>
  Boolean(left && right && left.kind === right.kind && left.id === right.id)

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
  const [micError, setMicError] = useState<string | null>(null)
  const [micReady, setMicReady] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const runtimesRef = useRef(new Map<string, PeerRuntime>())
  const contextRef = useRef<VoiceContext | null>(null)
  const playerIdRef = useRef<string | null>(currentPlayerId)
  const openMicRef = useRef(openMic)
  const pttActiveRef = useRef(pttActive)

  useEffect(() => {
    playerIdRef.current = currentPlayerId
  }, [currentPlayerId])

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

  const preferenceFor = (playerId: string): PeerPreference =>
    preferences[playerId] ?? { volume: 1, muted: false }

  const applyPreference = (runtime: PeerRuntime, preference: PeerPreference): void => {
    runtime.audio.volume = preference.muted ? 0 : preference.volume
  }

  const updatePreference = (playerId: string, next: PeerPreference): void => {
    setPreferences((current) => {
      const updated = { ...current, [playerId]: next }
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

  const ensureMicrophone = async (): Promise<MediaStream> => {
    if (streamRef.current) return streamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    })
    const track = stream.getAudioTracks()[0]
    if (track) track.enabled = openMicRef.current || pttActiveRef.current
    streamRef.current = stream
    setMicReady(true)
    setMicError(null)
    return stream
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

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.hidden = true
    document.body.appendChild(audio)
    const runtime: PeerRuntime = { peer, connection, audio, pendingIce: [] }
    runtimesRef.current.set(peer.id, runtime)
    applyPreference(runtime, preferenceFor(peer.id))

    const stream = await ensureMicrophone()
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
      if (connection.connectionState === 'failed') {
        connection.restartIce()
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

      const peer = peers.find(({ id }) => id === event.fromPlayerId) ?? {
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
  }, [desiredContext, enabled, peers])

  useEffect(() => {
    if (!enabled || !desiredContext || connectionStatus !== 'ready') {
      if (joinedContext) {
        void window.api.matchmaking.voiceLeave().catch(() => undefined)
      }
      setPttActive(false)
      closeAllPeers()
      setJoinedContext(null)
      return
    }

    if (!sameContext(joinedContext, desiredContext)) {
      setPttActive(false)
      closeAllPeers()
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
      for (const track of streamRef.current?.getTracks() ?? []) track.stop()
      streamRef.current = null
      void window.api.matchmaking.voiceLeave().catch(() => undefined)
    },
    []
  )

  if (!desiredContext && !joinedContext) return null

  const activeContext = joinedContext ?? desiredContext
  const contextLabel = activeContext?.kind === 'match' ? 'Team voice' : 'Party voice'
  const connectedPeers = peers.filter(({ id }) => peerStates[id] === 'connected').length
  const nativePttAvailable = activeContext?.kind === 'match'

  const disconnect = (): void => {
    setEnabled(false)
    setPttActive(false)
    void window.api.matchmaking.voiceLeave().catch(() => undefined)
    closeAllPeers()
    setJoinedContext(null)
  }

  const reconnect = (): void => {
    setEnabled(true)
    setMicError(null)
  }

  return (
    <aside className="fixed right-5 bottom-5 z-[70] w-[min(24rem,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-white/15 bg-neutral-950/95 text-white shadow-2xl backdrop-blur">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/5"
        onClick={() => setExpanded((value) => !value)}
      >
        <div>
          <p className="text-sm font-semibold">{contextLabel}</p>
          <p className="text-xs text-neutral-400">
            {enabled
              ? `${connectedPeers}/${peers.length} connected${openMic ? ' · Open mic' : pttActive ? ' · Talking' : ''}`
              : 'Disconnected'}
          </p>
        </div>
        <span className="text-lg text-neutral-400">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 p-4">
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
                    {nativePttAvailable ? 'PTT test' : 'Hold to talk'}
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

          {enabled && !openMic && nativePttAvailable && (
            <p className="mt-3 text-xs text-neutral-400">
              Counter-Strike push-to-talk controls this mic using your existing +voicerecord bind.
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
