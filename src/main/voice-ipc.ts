import { ipcMain, type WebContents } from 'electron'
import { getSessionToken } from './auth'
import { VOICE_CHANNELS, type VoiceEvent, type VoiceSignal } from '../shared/voice'

const API_BASE_URL = process.env.API_BASE_URL ?? 'https://16competitive.papamo.dev'
const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000
const ROOM_SYNC_INTERVAL_MS = 5_000
const PING_INTERVAL_MS = 20_000

const voiceWebSocketUrl = (): string => {
  const url = new URL('/voice/ws', API_BASE_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const isVoiceSignal = (value: unknown): value is VoiceSignal => {
  if (!value || typeof value !== 'object') return false
  const signal = value as Record<string, unknown>
  if ((signal.type === 'offer' || signal.type === 'answer') && typeof signal.sdp === 'string') {
    return signal.sdp.length > 0 && signal.sdp.length <= 24_000
  }
  return (
    signal.type === 'ice' &&
    typeof signal.candidate === 'string' &&
    signal.candidate.length > 0 &&
    signal.candidate.length <= 4_000
  )
}

const asVoiceEvent = (value: unknown): VoiceEvent | null => {
  if (!value || typeof value !== 'object') return null
  const event = value as Record<string, unknown>
  if (event.type === 'voice_room') {
    if (event.room === null) return { type: 'voice_room', room: null }
    if (!event.room || typeof event.room !== 'object') return null
    const room = event.room as Record<string, unknown>
    if (
      (room.scope !== 'party' && room.scope !== 'match_team') ||
      typeof room.roomId !== 'string' ||
      !Array.isArray(room.participants) ||
      room.participants.some(
        (participant) =>
          !participant ||
          typeof participant !== 'object' ||
          typeof (participant as Record<string, unknown>).id !== 'string' ||
          typeof (participant as Record<string, unknown>).username !== 'string'
      )
    ) {
      return null
    }
    return event as unknown as VoiceEvent
  }
  if (event.type === 'voice_peer_available') {
    const participant = event.participant as Record<string, unknown> | undefined
    return typeof event.roomId === 'string' && participant && typeof participant.id === 'string' && typeof participant.username === 'string'
      ? (event as unknown as VoiceEvent)
      : null
  }
  if (event.type === 'voice_peer_left') {
    return typeof event.roomId === 'string' && typeof event.playerId === 'string'
      ? (event as unknown as VoiceEvent)
      : null
  }
  if (event.type === 'voice_signal') {
    return typeof event.roomId === 'string' && typeof event.fromPlayerId === 'string' && isVoiceSignal(event.signal)
      ? (event as unknown as VoiceEvent)
      : null
  }
  if (event.type === 'voice_ptt' && typeof event.pressed === 'boolean') {
    return { type: 'voice_ptt', pressed: event.pressed }
  }
  if (event.type === 'error' && typeof event.code === 'string' && typeof event.message === 'string') {
    return event as unknown as VoiceEvent
  }
  return null
}

class VoiceConnection {
  private socket: WebSocket | null = null
  private renderer: WebContents | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempt = 0
  private authenticated = false
  private enabled = false

  connect(renderer: WebContents): void {
    this.renderer = renderer
    this.enabled = true
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      if (this.authenticated) this.send({ type: 'voice_sync' })
      return
    }
    this.open(false)
  }

  disconnect(): void {
    this.enabled = false
    this.authenticated = false
    this.stopTimers()
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ type: 'voice_leave' }))
      } catch {
        // Socket is already leaving.
      }
    }
    this.socket?.close()
    this.socket = null
    this.reconnectAttempt = 0
    this.notify({ type: 'connection_state', state: 'disconnected' })
  }

  sync(): void {
    if (!this.enabled) return
    this.send({ type: 'voice_sync' })
  }

  signal(roomId: unknown, targetPlayerId: unknown, signal: unknown): void {
    if (typeof roomId !== 'string' || roomId.length < 1 || roomId.length > 180) {
      throw new Error('Invalid voice room')
    }
    if (typeof targetPlayerId !== 'string' || targetPlayerId.length < 1 || targetPlayerId.length > 80) {
      throw new Error('Invalid voice peer')
    }
    if (!isVoiceSignal(signal)) throw new Error('Invalid voice signal')
    this.send({ type: 'voice_signal', roomId, targetPlayerId, signal })
  }

  private open(reconnecting: boolean): void {
    if (!this.enabled) return
    const token = getSessionToken()
    if (!token) {
      this.notify({ type: 'error', code: 'VOICE_UNAUTHORIZED', message: 'Sign in to use voice chat.' })
      return
    }
    this.notify({ type: 'connection_state', state: reconnecting ? 'reconnecting' : 'connecting' })
    const socket = new WebSocket(voiceWebSocketUrl())
    this.socket = socket

    socket.addEventListener('message', (message) => {
      if (this.socket !== socket || typeof message.data !== 'string') return
      let parsed: unknown
      try {
        parsed = JSON.parse(message.data)
      } catch {
        return
      }
      if (!parsed || typeof parsed !== 'object') return
      const raw = parsed as Record<string, unknown>
      if (raw.type === 'connected') {
        socket.send(JSON.stringify({ type: 'authenticate', token }))
        return
      }
      if (raw.type === 'authenticated') {
        this.authenticated = true
        this.reconnectAttempt = 0
        this.notify({ type: 'connection_state', state: 'connected' })
        this.send({ type: 'voice_sync' })
        this.startTimers()
        return
      }
      if (raw.type === 'pong') return
      const event = asVoiceEvent(parsed)
      if (event) this.notify(event)
    })

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.authenticated = false
      this.stopTimers()
      if (!this.enabled) return
      this.notify({ type: 'connection_state', state: 'reconnecting' })
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      if (this.socket === socket) console.warn('[Voice] signaling socket error')
    })
  }

  private startTimers(): void {
    this.stopTimers()
    this.syncTimer = setInterval(() => {
      if (this.authenticated) this.send({ type: 'voice_sync' })
    }, ROOM_SYNC_INTERVAL_MS)
    this.pingTimer = setInterval(() => {
      if (this.authenticated) this.send({ type: 'ping' })
    }, PING_INTERVAL_MS)
  }

  private stopTimers(): void {
    if (this.syncTimer) clearInterval(this.syncTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.syncTimer = null
    this.pingTimer = null
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.enabled) return
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt++, RECONNECT_MAX_DELAY_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open(true)
    }, delay)
  }

  private send(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.authenticated) {
      if (message && 'type' in message && message.type === 'voice_sync') return
      throw new Error('Voice chat is not connected yet')
    }
    this.socket.send(JSON.stringify(message))
  }

  private notify(event: VoiceEvent): void {
    if (this.renderer && !this.renderer.isDestroyed()) {
      this.renderer.send(VOICE_CHANNELS.event, event)
    }
  }
}

const voiceConnection = new VoiceConnection()

ipcMain.handle(VOICE_CHANNELS.connect, (event) => voiceConnection.connect(event.sender))
ipcMain.handle(VOICE_CHANNELS.disconnect, () => voiceConnection.disconnect())
ipcMain.handle(VOICE_CHANNELS.sync, () => voiceConnection.sync())
ipcMain.handle(VOICE_CHANNELS.signal, (_, roomId: unknown, targetPlayerId: unknown, signal: unknown) =>
  voiceConnection.signal(roomId, targetPlayerId, signal)
)
