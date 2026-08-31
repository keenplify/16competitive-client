import type { WebContents } from 'electron'
import { BrowserWindow } from 'electron'
import { MATCHMAKING_CHANNELS } from '../shared/matchmaking'
import type {
  MatchmakingEvent,
  MatchmakingMode,
  MatchmakingServerMessage,
  QueuedPlayer
} from '../shared/matchmaking'
import { getSessionToken } from './auth'
import { MATCHMAKING_WS_URL } from './config'
import { closeCounterStrikeForMatch, launchCounterStrikeForMatch } from './game/cs16-launcher'
type MatchConnection = Extract<MatchmakingServerMessage, { type: 'match_connect' }>

const RECONNECT_DELAY_MS = 2_000
const MATCH_RESULT_GRACE_PERIOD_MS = 5_000

const isMode = (value: unknown): value is MatchmakingMode => value === '3v3' || value === '5v5'
const isMapId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value)

const isPlayer = (value: unknown): value is QueuedPlayer => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.mmr === 'number'
  )
}

const isMatchPlayerStats = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.kills === 'number' &&
    typeof player.deaths === 'number' &&
    typeof player.assists === 'number'
  )
}

const partyNotificationCodes = new Set([
  'MEMBER_CONNECTED',
  'MEMBER_DISCONNECTED',
  'MEMBER_RECONNECTED',
  'MEMBER_JOINED',
  'MEMBER_LEFT',
  'MEMBER_INACTIVE',
  'PARTY_DISBANDED',
  'INVITATION_SENT',
  'INVITATION_DECLINED',
  'QUEUE_JOINED',
  'QUEUE_LEFT',
  'MATCH_FOUND',
  'MATCH_READY',
  'MATCH_COUNTDOWN',
  'MATCH_SERVER',
  'MATCH_CANCELLED'
])

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
      return isMode(message.mode) && isMapId(message.mapId)
    case 'queue_status':
      return (
        isMode(message.mode) &&
        isMapId(message.mapId) &&
        typeof message.queuedPlayers === 'number' &&
        typeof message.playersRequired === 'number' &&
        typeof message.position === 'number'
      )
    case 'party_invitation_received':
    case 'party_updated':
    case 'party_disbanded':
      return true
    case 'party_presence_ping':
      return (
        typeof message.nonce === 'string' && message.nonce.length > 0 && message.nonce.length <= 64
      )
    case 'party_chat_message':
      return (
        typeof message.id === 'string' &&
        typeof message.partyId === 'string' &&
        typeof message.message === 'string' &&
        typeof message.sentAt === 'string' &&
        typeof message.sender === 'object' &&
        message.sender !== null &&
        typeof (message.sender as Record<string, unknown>).id === 'string' &&
        typeof (message.sender as Record<string, unknown>).username === 'string'
      )
    case 'party_chat_notification':
      return (
        typeof message.id === 'string' &&
        typeof message.partyId === 'string' &&
        typeof message.code === 'string' &&
        partyNotificationCodes.has(message.code) &&
        typeof message.message === 'string' &&
        typeof message.sentAt === 'string'
      )
    case 'match_found': {
      if (
        typeof message.matchId !== 'string' ||
        !isMode(message.mode) ||
        !isMapId(message.mapId) ||
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
    case 'match_ready_check':
      return (
        typeof message.matchId === 'string' &&
        typeof message.deadline === 'string' &&
        Array.isArray(message.acceptedPlayerIds) &&
        message.acceptedPlayerIds.every((id) => typeof id === 'string') &&
        typeof message.playersRequired === 'number'
      )
    case 'match_ready_updated':
      return (
        typeof message.matchId === 'string' &&
        Array.isArray(message.acceptedPlayerIds) &&
        message.acceptedPlayerIds.every((id) => typeof id === 'string') &&
        typeof message.playersRequired === 'number'
      )
    case 'match_countdown':
      return typeof message.matchId === 'string' && typeof message.secondsRemaining === 'number'
    case 'match_server_starting':
      return typeof message.matchId === 'string'
    case 'match_connect':
      return (
        typeof message.matchId === 'string' &&
        typeof message.host === 'string' &&
        message.host.length > 0 &&
        typeof message.port === 'number' &&
        Number.isInteger(message.port) &&
        message.port >= 1 &&
        message.port <= 65535 &&
        typeof message.password === 'string' &&
        typeof message.joinToken === 'string' &&
        /^[A-Za-z0-9_-]{32,64}$/.test(message.joinToken)
      )
    case 'match_cancelled':
      return (
        typeof message.matchId === 'string' &&
        typeof message.reason === 'string' &&
        ['PLAYER_DECLINED', 'PLAYER_NOT_READY', 'SERVER_START_FAILED'].includes(message.reason) &&
        typeof message.message === 'string'
      )
    case 'match_finished':
      return (
        typeof message.matchId === 'string' &&
        (message.winner === 1 || message.winner === 2) &&
        typeof message.teamAScore === 'number' &&
        typeof message.teamBScore === 'number' &&
        Array.isArray(message.players) &&
        message.players.every(isMatchPlayerStats)
      )
    case 'game_process_exited':
      return (
        typeof message.matchId === 'string' &&
        (typeof message.code === 'number' || message.code === null) &&
        (typeof message.signal === 'string' || message.signal === null)
      )
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
  private desiredMapId: string | null = null
  private manuallyDisconnected = false
  private authenticated = false
  private recoveryStatusPending = false
  private lastConnection: MatchConnection | null = null
  private matchEndTimers = new Map<string, ReturnType<typeof setTimeout>>()

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
    this.recoveryStatusPending = false
    this.desiredMode = null
    this.desiredMapId = null
    this.lastConnection = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    this.renderer = null
  }

  joinQueue(mode: unknown, mapId: unknown): void {
    if (!isMode(mode)) throw new Error('Unsupported matchmaking mode')
    if (!isMapId(mapId)) throw new Error('A valid matchmaking map is required')
    this.desiredMode = mode
    this.desiredMapId = mapId
    this.send({ type: 'join_queue', mode, mapId })
  }

  leaveQueue(): void {
    this.desiredMode = null
    this.desiredMapId = null
    this.send({ type: 'leave_queue' })
  }

  getQueueStatus(): void {
    this.send({ type: 'get_queue_status' })
  }

  sendPartyMessage(message: unknown): void {
    if (typeof message !== 'string' || message.trim().length === 0 || message.length > 300) {
      throw new Error('Party messages must contain 1–300 characters')
    }
    this.send({ type: 'party_chat_send', message: message.trim() })
  }

  respondReady(matchId: unknown, accepted: unknown): void {
    if (typeof matchId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(matchId)) {
      throw new Error('Invalid match ready check')
    }
    if (typeof accepted !== 'boolean') throw new Error('Invalid ready response')
    this.send({ type: 'match_ready_response', matchId, accepted })
  }

  async reconnectGame(): Promise<void> {
    if (!this.lastConnection) throw new Error('No previous match connection is available')
    const connection = this.lastConnection
    await launchCounterStrikeForMatch({
      ...connection,
      onExit: ({ code, signal }) =>
        this.notify({ type: 'game_process_exited', matchId: connection.matchId, code, signal })
    })
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
      } else if (parsed.type === 'party_presence_ping') {
        socket.send(JSON.stringify({ type: 'party_presence_pong', nonce: parsed.nonce }))
        return
      } else if (parsed.type === 'authenticated') {
        this.authenticated = true
        this.recoveryStatusPending = true
        socket.send(JSON.stringify({ type: 'get_queue_status' }))
        if (this.desiredMode && this.desiredMapId) {
          socket.send(
            JSON.stringify({
              type: 'join_queue',
              mode: this.desiredMode,
              mapId: this.desiredMapId
            })
          )
        }
      } else if (parsed.type === 'queue_status' || parsed.type === 'match_ready_check') {
        this.recoveryStatusPending = false
      } else if (parsed.type === 'queue_joined') {
        this.desiredMode = parsed.mode
        this.desiredMapId = parsed.mapId
      } else if (parsed.type === 'queue_left' || parsed.type === 'match_found') {
        this.desiredMode = null
        this.desiredMapId = null
        if (parsed.type === 'match_found' && this.renderer) {
          const window = BrowserWindow.fromWebContents(this.renderer)
          window?.show()
          window?.focus()
        }
      } else if (parsed.type === 'match_connect') {
        const isRecoveredConnection = this.recoveryStatusPending
        this.recoveryStatusPending = false
        this.lastConnection = parsed
        console.info('[Matchmaking] match_connect received', {
          matchId: parsed.matchId,
          host: parsed.host,
          port: parsed.port
        })
        if (!isRecoveredConnection) {
          void launchCounterStrikeForMatch({
            ...parsed,
            onExit: ({ code, signal }) =>
              this.notify({ type: 'game_process_exited', matchId: parsed.matchId, code, signal })
          }).catch((error: unknown) => {
            console.error('[GameLaunch] failed', error)
            this.notify({
              type: 'error',
              code: 'GAME_LAUNCH_FAILED',
              message: error instanceof Error ? error.message : 'Could not launch Counter-Strike.'
            })
          })
        }
      } else if (parsed.type === 'match_finished' && !this.matchEndTimers.has(parsed.matchId)) {
        const timer = setTimeout(() => {
          this.matchEndTimers.delete(parsed.matchId)
          closeCounterStrikeForMatch(parsed.matchId)
          const window = this.renderer ? BrowserWindow.fromWebContents(this.renderer) : null
          if (!window || window.isDestroyed()) return
          if (window.isMinimized()) window.restore()
          window.show()
          window.focus()
        }, MATCH_RESULT_GRACE_PERIOD_MS)
        this.matchEndTimers.set(parsed.matchId, timer)
      } else if (parsed.type === 'error' && this.recoveryStatusPending) {
        this.recoveryStatusPending = false
        if (parsed.code === 'NOT_QUEUED') return
      }

      this.notify(parsed)
    })

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.authenticated = false
      this.recoveryStatusPending = false
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
