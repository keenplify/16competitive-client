import type { WebContents } from 'electron'
import { MATCHMAKING_CHANNELS } from '../shared/matchmaking'
import type {
  MatchmakingEvent,
  MatchmakingMode,
  MatchmakingServerMessage,
  QueuedPlayer
} from '../shared/matchmaking'
import { getSessionToken } from './auth'
import { MATCHMAKING_WS_URL } from './config'

const RECONNECT_DELAY_MS = 2_000

const isMode = (value: unknown): value is MatchmakingMode => value === '3v3' || value === '5v5'

const isPlayer = (value: unknown): value is QueuedPlayer => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.mmr === 'number'
  )
}

const isServerMessage = (value: unknown): value is MatchmakingServerMessage => {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const message = value as Record<string, unknown>

  switch (message.type) {
    case 'connected':
      return message.authenticated === false
    case 'authenticated':
      return isPlayer(message.player)
    case 'queue_joined':
    case 'queue_left':
      return isMode(message.mode)
    case 'queue_status':
      return (
        isMode(message.mode) &&
        typeof message.queuedPlayers === 'number' &&
        typeof message.playersRequired === 'number' &&
        typeof message.position === 'number'
      )
    case 'match_found': {
      if (
        typeof message.matchId !== 'string' ||
        !isMode(message.mode) ||
        typeof message.teams !== 'object' ||
        message.teams === null
      ) {
        return false
      }
      const teams = message.teams as Record<string, unknown>
      return (
        Array.isArray(teams.teamA) &&
        teams.teamA.every(isPlayer) &&
        Array.isArray(teams.teamB) &&
        teams.teamB.every(isPlayer)
      )
    }
    case 'error':
      return typeof message.code === 'string' && typeof message.message === 'string'
    case 'pong':
      return true
    default:
      return false
  }
}

class MatchmakingConnection {
  private socket: WebSocket | null = null
  private renderer: WebContents | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private desiredMode: MatchmakingMode | null = null
  private manuallyDisconnected = false
  private authenticated = false

  connect(renderer: WebContents): void {
    this.renderer = renderer
    this.manuallyDisconnected = false

    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return
    }

    this.openSocket(false)
  }

  disconnect(): void {
    this.manuallyDisconnected = true
    this.authenticated = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    this.renderer = null
  }

  joinQueue(mode: unknown): void {
    if (!isMode(mode)) throw new Error('Unsupported matchmaking mode')
    this.desiredMode = mode
    this.send({ type: 'join_queue', mode })
  }

  leaveQueue(): void {
    this.desiredMode = null
    this.send({ type: 'leave_queue' })
  }

  getQueueStatus(): void {
    this.send({ type: 'get_queue_status' })
  }

  private openSocket(reconnecting: boolean): void {
    const token = getSessionToken()
    if (!token) throw new Error('Sign in before connecting to matchmaking')

    this.notify({
      type: 'connection_state',
      state: reconnecting ? 'reconnecting' : 'connecting'
    })

    const socket = new WebSocket(MATCHMAKING_WS_URL)
    this.socket = socket

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket || typeof event.data !== 'string') return

      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        this.notify({ type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid server message' })
        return
      }

      if (!isServerMessage(parsed)) {
        this.notify({ type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid server message' })
        return
      }

      if (parsed.type === 'connected') {
        socket.send(JSON.stringify({ type: 'authenticate', token }))
      } else if (parsed.type === 'authenticated') {
        this.authenticated = true
        if (this.desiredMode) {
          socket.send(JSON.stringify({ type: 'join_queue', mode: this.desiredMode }))
        }
      } else if (parsed.type === 'queue_joined') {
        this.desiredMode = parsed.mode
      } else if (parsed.type === 'queue_left' || parsed.type === 'match_found') {
        this.desiredMode = null
      }

      this.notify(parsed)
    })

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.authenticated = false
      this.notify({ type: 'connection_state', state: 'disconnected' })

      if (!this.manuallyDisconnected && this.renderer && !this.renderer.isDestroyed()) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.openSocket(true)
        }, RECONNECT_DELAY_MS)
      }
    })
  }

  private send(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.authenticated) {
      throw new Error('Matchmaking is not connected yet')
    }
    this.socket.send(JSON.stringify(message))
  }

  private notify(event: MatchmakingEvent): void {
    if (this.renderer && !this.renderer.isDestroyed()) {
      this.renderer.send(MATCHMAKING_CHANNELS.event, event)
    }
  }
}

export const matchmakingConnection = new MatchmakingConnection()
