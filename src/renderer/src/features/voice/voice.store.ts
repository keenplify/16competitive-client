import { create } from 'zustand'
import type { VoiceEvent, VoiceParticipant, VoiceRoom, VoiceSignal } from '../../../../shared/voice'

export type VoiceMicMode = 'push_to_talk' | 'open_mic'

type VoiceConnectionState = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'error'
type PeerConnectionState = 'connecting' | 'connected' | 'disconnected'

export interface VoicePeer extends VoiceParticipant {
  volume: number
  muted: boolean
  state: PeerConnectionState
}

interface VoiceState {
  connectionState: VoiceConnectionState
  room: VoiceRoom | null
  peers: VoicePeer[]
  micMode: VoiceMicMode
  pttPressed: boolean
  microphoneReady: boolean
  error: string | null
  initialize: (playerId: string) => void
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sync: () => Promise<void>
  setMicMode: (mode: VoiceMicMode) => void
  setPttPressed: (pressed: boolean) => void
  setPeerVolume: (playerId: string, volume: number) => void
  togglePeerMuted: (playerId: string) => void
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }]
const MIC_MODE_KEY = '16competitive.voice.mic-mode'

let currentPlayerId: string | null = null
let removeVoiceListener: (() => void) | null = null
let localStream: MediaStream | null = null
const peerConnections = new Map<string, RTCPeerConnection>()
const peerAudio = new Map<string, HTMLAudioElement>()
const pendingIce = new Map<string, RTCIceCandidateInit[]>()

const peerPreferenceKey = (playerId: string): string => `16competitive.voice.peer.${playerId}`

const loadMicMode = (): VoiceMicMode =>
  localStorage.getItem(MIC_MODE_KEY) === 'open_mic' ? 'open_mic' : 'push_to_talk'

const loadPeerPreference = (playerId: string): Pick<VoicePeer, 'volume' | 'muted'> => {
  try {
    const raw = localStorage.getItem(peerPreferenceKey(playerId))
    if (!raw) return { volume: 1, muted: false }
    const value = JSON.parse(raw) as { volume?: unknown; muted?: unknown }
    return {
      volume:
        typeof value.volume === 'number' && Number.isFinite(value.volume)
          ? Math.max(0, Math.min(1, value.volume))
          : 1,
      muted: value.muted === true
    }
  } catch {
    return { volume: 1, muted: false }
  }
}

const persistPeerPreference = (peer: VoicePeer): void => {
  localStorage.setItem(
    peerPreferenceKey(peer.id),
    JSON.stringify({ volume: peer.volume, muted: peer.muted })
  )
}

const stopPeer = (playerId: string): void => {
  peerConnections.get(playerId)?.close()
  peerConnections.delete(playerId)
  pendingIce.delete(playerId)
  const audio = peerAudio.get(playerId)
  if (audio) {
    audio.pause()
    audio.srcObject = null
  }
  peerAudio.delete(playerId)
}

const stopAllPeers = (): void => {
  for (const playerId of peerConnections.keys()) stopPeer(playerId)
}

const stopLocalStream = (): void => {
  for (const track of localStream?.getTracks() ?? []) track.stop()
  localStream = null
}

const updateTrackEnabled = (state: VoiceState): void => {
  const enabled = state.micMode === 'open_mic' || state.pttPressed
  for (const track of localStream?.getAudioTracks() ?? []) track.enabled = enabled
}

export const useVoiceStore = create<VoiceState>((set, get) => {
  const updatePeerState = (playerId: string, state: PeerConnectionState): void => {
    set((current) => ({
      peers: current.peers.map((peer) => (peer.id === playerId ? { ...peer, state } : peer))
    }))
  }

  const ensureMicrophone = async (): Promise<MediaStream> => {
    if (localStream) return localStream
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      updateTrackEnabled(get())
      set({ microphoneReady: true, error: null })
      return localStream
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Microphone permission was not available.'
      set({ microphoneReady: false, error: message })
      throw error
    }
  }

  const flushPendingIce = async (playerId: string, connection: RTCPeerConnection): Promise<void> => {
    if (!connection.remoteDescription) return
    const candidates = pendingIce.get(playerId) ?? []
    pendingIce.delete(playerId)
    for (const candidate of candidates) {
      await connection.addIceCandidate(candidate).catch(() => undefined)
    }
  }

  const ensurePeerConnection = async (participant: VoiceParticipant): Promise<RTCPeerConnection> => {
    const existing = peerConnections.get(participant.id)
    if (existing) return existing
    const room = get().room
    if (!room || !currentPlayerId) throw new Error('Voice room is unavailable')

    const stream = await ensureMicrophone()
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peerConnections.set(participant.id, connection)
    updatePeerState(participant.id, 'connecting')

    for (const track of stream.getAudioTracks()) connection.addTrack(track, stream)

    connection.addEventListener('icecandidate', (event) => {
      if (!event.candidate || !get().room) return
      const candidate = event.candidate.toJSON()
      void window.api.voice.signal(room.roomId, participant.id, {
        type: 'ice',
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex
      })
    })

    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'connected') updatePeerState(participant.id, 'connected')
      else if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        updatePeerState(participant.id, 'disconnected')
      }
    })

    connection.addEventListener('track', (event) => {
      const audio = peerAudio.get(participant.id) ?? new Audio()
      peerAudio.set(participant.id, audio)
      audio.autoplay = true
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track])
      const peer = get().peers.find(({ id }) => id === participant.id)
      audio.volume = peer?.volume ?? 1
      audio.muted = peer?.muted ?? false
      void audio.play().catch(() => undefined)
    })

    return connection
  }

  const offerTo = async (participant: VoiceParticipant): Promise<void> => {
    if (!currentPlayerId || currentPlayerId.localeCompare(participant.id) >= 0) return
    const room = get().room
    if (!room) return
    const connection = await ensurePeerConnection(participant)
    if (connection.signalingState !== 'stable' || connection.localDescription) return
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    if (connection.localDescription?.sdp) {
      await window.api.voice.signal(room.roomId, participant.id, {
        type: 'offer',
        sdp: connection.localDescription.sdp
      })
    }
  }

  const addParticipant = (participant: VoiceParticipant): void => {
    if (participant.id === currentPlayerId) return
    set((current) => {
      if (current.peers.some(({ id }) => id === participant.id)) return current
      return {
        peers: [
          ...current.peers,
          { ...participant, ...loadPeerPreference(participant.id), state: 'connecting' }
        ]
      }
    })
  }

  const handleSignal = async (fromPlayerId: string, signal: VoiceSignal): Promise<void> => {
    const room = get().room
    const participant = room?.participants.find(({ id }) => id === fromPlayerId)
    if (!room || !participant) return
    addParticipant(participant)
    const connection = await ensurePeerConnection(participant)

    if (signal.type === 'offer') {
      await connection.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
      await flushPendingIce(fromPlayerId, connection)
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      if (connection.localDescription?.sdp) {
        await window.api.voice.signal(room.roomId, fromPlayerId, {
          type: 'answer',
          sdp: connection.localDescription.sdp
        })
      }
      return
    }

    if (signal.type === 'answer') {
      if (connection.signalingState === 'have-local-offer') {
        await connection.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
        await flushPendingIce(fromPlayerId, connection)
      }
      return
    }

    const candidate: RTCIceCandidateInit = {
      candidate: signal.candidate,
      sdpMid: signal.sdpMid,
      sdpMLineIndex: signal.sdpMLineIndex
    }
    if (!connection.remoteDescription) {
      pendingIce.set(fromPlayerId, [...(pendingIce.get(fromPlayerId) ?? []), candidate])
      return
    }
    await connection.addIceCandidate(candidate).catch(() => undefined)
  }

  const handleEvent = (event: VoiceEvent): void => {
    if (event.type === 'connection_state') {
      set({ connectionState: event.state === 'connected' ? 'connected' : event.state })
      return
    }
    if (event.type === 'error') {
      set({ connectionState: 'error', error: event.message })
      return
    }
    if (event.type === 'voice_room') {
      const previousRoomId = get().room?.roomId
      if (previousRoomId !== event.room?.roomId) stopAllPeers()
      const peers = (event.room?.participants ?? [])
        .filter(({ id }) => id !== currentPlayerId)
        .map((participant) => ({
          ...participant,
          ...loadPeerPreference(participant.id),
          state: 'connecting' as const
        }))
      set({ room: event.room, peers, error: null })
      if (!event.room || peers.length === 0) return
      void ensureMicrophone().then(() => {
        for (const participant of event.room?.participants ?? []) void offerTo(participant)
      })
      return
    }
    if (event.type === 'voice_peer_available') {
      if (event.roomId !== get().room?.roomId) return
      addParticipant(event.participant)
      void offerTo(event.participant)
      return
    }
    if (event.type === 'voice_peer_left') {
      if (event.roomId !== get().room?.roomId) return
      stopPeer(event.playerId)
      updatePeerState(event.playerId, 'disconnected')
      return
    }
    if (event.type === 'voice_signal' && event.roomId === get().room?.roomId) {
      void handleSignal(event.fromPlayerId, event.signal).catch((error: unknown) =>
        set({ error: error instanceof Error ? error.message : 'Voice negotiation failed.' })
      )
    }
  }

  return {
    connectionState: 'disabled',
    room: null,
    peers: [],
    micMode: loadMicMode(),
    pttPressed: false,
    microphoneReady: false,
    error: null,

    initialize: (playerId) => {
      if (currentPlayerId === playerId && removeVoiceListener) return
      removeVoiceListener?.()
      currentPlayerId = playerId
      removeVoiceListener = window.api.voice.onEvent(handleEvent)
      void get().connect()
    },

    connect: async () => {
      set({ connectionState: 'connecting', error: null })
      try {
        await window.api.voice.connect()
      } catch (error) {
        set({
          connectionState: 'error',
          error: error instanceof Error ? error.message : 'Voice chat could not connect.'
        })
      }
    },

    disconnect: async () => {
      stopAllPeers()
      stopLocalStream()
      set({
        connectionState: 'disabled',
        room: null,
        peers: [],
        pttPressed: false,
        microphoneReady: false,
        error: null
      })
      await window.api.voice.disconnect().catch(() => undefined)
    },

    sync: async () => {
      await window.api.voice.sync()
    },

    setMicMode: (mode) => {
      localStorage.setItem(MIC_MODE_KEY, mode)
      set({ micMode: mode })
      updateTrackEnabled({ ...get(), micMode: mode })
    },

    setPttPressed: (pressed) => {
      set({ pttPressed: pressed })
      updateTrackEnabled({ ...get(), pttPressed: pressed })
    },

    setPeerVolume: (playerId, volume) => {
      const normalized = Math.max(0, Math.min(1, volume))
      set((current) => ({
        peers: current.peers.map((peer) => {
          if (peer.id !== playerId) return peer
          const next = { ...peer, volume: normalized }
          persistPeerPreference(next)
          return next
        })
      }))
      const audio = peerAudio.get(playerId)
      if (audio) audio.volume = normalized
    },

    togglePeerMuted: (playerId) => {
      set((current) => ({
        peers: current.peers.map((peer) => {
          if (peer.id !== playerId) return peer
          const next = { ...peer, muted: !peer.muted }
          persistPeerPreference(next)
          const audio = peerAudio.get(playerId)
          if (audio) audio.muted = next.muted
          return next
        })
      }))
    }
  }
})
