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
import {
  getMatchmakingNodes,
  getMatchmakingPreferences,
  toMatchmakingWsUrl
} from './matchmaking-regions'
import { closeCounterStrikeForMatch, launchCounterStrikeForMatch } from './game/cs16-launcher'
import {
  clearMatchAssetPreload,
  startMatchAssetPreload,
  waitForMatchAssetPreload
} from './game/match-assets'
type MatchConnection = Extract<MatchmakingServerMessage, { type: 'match_connect' }>

const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000
const PING_INTERVAL_MS = 20_000
const MATCH_RESULT_GRACE_PERIOD_MS = 5_000

const isMode = (value: unknown): value is MatchmakingMode => value === '5v5' || value === 'casual'
const isMapId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value)

const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}

const isPlayer = (value: unknown): value is QueuedPlayer => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.mmr === 'number'
  )
}

const isTeams = (value: unknown): value is { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] } => {
  if (typeof value !== 'object' || value === null) return false
  const teams = value as Record<string, unknown>
  return (
    Array.isArray(teams.teamA) &&
    teams.teamA.every(isPlayer) &&
    Array.isArray(teams.teamB) &&
    teams.teamB.every(isPlayer)
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
      return (
        isMode(message.mode) &&
        isMapId(message.mapId) &&
        typeof message.region === 'string' &&
        typeof message.allowRegionExpansion === 'boolean'
      )
    case 'queue_left':
      return isMode(message.mode) && isMapId(message.mapId)
    case 'queue_status':
      return (
        isMode(message.mode) &&
        isMapId(message.mapId) &&
        typeof message.queuedPlayers === 'number' &&
        typeof message.playersRequired === 'number' &&
        typeof message.position === 'number' &&
        typeof message.region === 'string' &&
        typeof message.allowRegionExpansion === 'boolean'
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
        typeof message.region !== 'string' ||
        !isHttpUrl(message.hostApiUrl) ||
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
        isMode(message.mode) &&
        isMapId(message.mapId) &&
        isTeams(message.teams) &&
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
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private desiredMode: MatchmakingMode | null = null
  private desiredMapId: string | null = null
  private desiredAllowRegionExpansion = true
  private activeApiUrl: string | null = null
  private hostApiUrl: string | null = null
  private reconnectAttempt = 0
  private seenMatchEvents = new Set<string>()
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
    this.activeApiUrl = null
    this.hostApiUrl = null
    this.reconnectAttempt = 0
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.socket?.close()
    this.socket = null
    this.renderer = null
  }

  joinQueue(mode: unknown, mapId: unknown, allowRegionExpansion: unknown): void {
    if (!isMode(mode)) throw new Error('Unsupported matchmaking mode')
    if (!isMapId(mapId)) throw new Error('A valid matchmaking map is required')
    if (typeof allowRegionExpansion !== 'boolean')
      throw new Error('Invalid regional search preference')
    this.desiredMode = mode
    this.desiredMapId = mapId
    this.desiredAllowRegionExpansion = allowRegionExpansion
    this.send({ type: 'join_queue', mode, mapId, allowRegionExpansion })
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
    try {
      await waitForMatchAssetPreload(connection.matchId)
    } catch {
      // Recovery after a launcher restart has no in-memory preload. A previous
      // attempt may also have failed, so replace it with a fresh verified run.
      clearMatchAssetPreload(connection.matchId)
      await this.prepareMatchAssets(connection.matchId)
    }
    await launchCounterStrikeForMatch({
      ...connection,
      onExit: ({ code, signal }) =>
        this.notify({ type: 'game_process_exited', matchId: connection.matchId, code, signal })
    })
  }

  private prepareMatchAssets(matchId: string): Promise<void> {
    const hostApiUrl = this.activeApiUrl ?? this.hostApiUrl
    if (!hostApiUrl) throw new Error('The match asset server is unavailable.')
    return startMatchAssetPreload(matchId, hostApiUrl, (progress) =>
      this.notify({ type: 'match_assets_progress', matchId, ...progress })
    )
  }

  private openSocket(reconnecting: boolean, apiUrl?: string, handoff = false): void {
    const token = getSessionToken()
    if (!token) throw new Error('Sign in before connecting to matchmaking')
    this.notify({
      type: 'connection_state',
      state: handoff ? 'handoff' : reconnecting ? 'reconnecting' : 'connecting'
    })
    void this.createSocket(token, apiUrl, handoff)
  }

  private async createSocket(token: string, apiUrl?: string, handoff = false): Promise<void> {
    let targetApiUrl = apiUrl ?? this.hostApiUrl
    if (!targetApiUrl) {
      try {
        const [nodes, preferences] = await Promise.all([
          getMatchmakingNodes(),
          getMatchmakingPreferences()
        ])
        targetApiUrl = await this.selectApiUrl(nodes, preferences.selectedNodeId)
      } catch {
        // A bootstrap node may be the only node during development or an outage.
      }
    }
    const websocketUrl = targetApiUrl ? toMatchmakingWsUrl(targetApiUrl) : MATCHMAKING_WS_URL
    const socket = new WebSocket(websocketUrl)
    if (!handoff) this.socket = socket

    socket.addEventListener('message', (event) => {
      if ((!handoff && this.socket !== socket) || typeof event.data !== 'string') return
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
      if (
        parsed.type === 'match_found' &&
        this.seenMatchEvents.has(`${parsed.type}:${parsed.matchId}`)
      ) {
        return
      }
      if (parsed.type === 'connected') {
        socket.send(JSON.stringify({ type: 'authenticate', token }))
        return
      }
      if (parsed.type === 'party_presence_ping') {
        socket.send(JSON.stringify({ type: 'party_presence_pong', nonce: parsed.nonce }))
        return
      }
      if (parsed.type === 'authenticated') {
        if (handoff) {
          const oldSocket = this.socket
          this.socket = socket
          this.hostApiUrl = targetApiUrl ?? null
          this.activeApiUrl = targetApiUrl ?? null
          this.authenticated = true
          oldSocket?.close()
        } else {
          this.authenticated = true
          this.activeApiUrl = targetApiUrl ?? null
          this.reconnectAttempt = 0
          this.recoveryStatusPending = true
          socket.send(JSON.stringify({ type: 'get_queue_status' }))
          if (this.desiredMode && this.desiredMapId) {
            socket.send(
              JSON.stringify({
                type: 'join_queue',
                mode: this.desiredMode,
                mapId: this.desiredMapId,
                allowRegionExpansion: this.desiredAllowRegionExpansion
              })
            )
          }
        }
        this.startPing()
        this.notify({ type: 'connection_endpoint', apiUrl: this.activeApiUrl, websocketUrl })
      } else if (parsed.type === 'queue_status' || parsed.type === 'match_ready_check') {
        this.recoveryStatusPending = false
      } else if (parsed.type === 'queue_joined') {
        this.desiredMode = parsed.mode
        this.desiredMapId = parsed.mapId
        this.desiredAllowRegionExpansion = parsed.allowRegionExpansion
      } else if (parsed.type === 'queue_left') {
        this.desiredMode = null
        this.desiredMapId = null
      } else if (parsed.type === 'match_found') {
        this.desiredMode = null
        this.desiredMapId = null
        if (this.renderer) {
          const window = BrowserWindow.fromWebContents(this.renderer)
          window?.show()
          window?.focus()
        }
        if (parsed.hostApiUrl !== this.activeApiUrl) {
          this.authenticated = false
          this.hostApiUrl = parsed.hostApiUrl
          this.openSocket(false, parsed.hostApiUrl, true)
        }
        void startMatchAssetPreload(parsed.matchId, parsed.hostApiUrl, (progress) =>
          this.notify({ type: 'match_assets_progress', matchId: parsed.matchId, ...progress })
        ).catch((error: unknown) =>
          this.notify({
            type: 'error',
            code: 'MATCH_ASSET_PRELOAD_FAILED',
            message:
              error instanceof Error
                ? error.message
                : 'Could not prepare the required match assets.'
          })
        )
      } else if (parsed.type === 'match_connect') {
        const isRecoveredConnection = this.recoveryStatusPending
        this.recoveryStatusPending = false
        this.lastConnection = parsed
        if (isRecoveredConnection) {
          void this.prepareMatchAssets(parsed.matchId).catch((error: unknown) =>
            this.notify({
              type: 'error',
              code: 'MATCH_ASSET_PRELOAD_FAILED',
              message:
                error instanceof Error
                  ? error.message
                  : 'Could not prepare the required match assets.'
            })
          )
        } else {
          void waitForMatchAssetPreload(parsed.matchId)
            .then(() =>
              launchCounterStrikeForMatch({
                ...parsed,
                onExit: ({ code, signal }) =>
                  this.notify({
                    type: 'game_process_exited',
                    matchId: parsed.matchId,
                    code,
                    signal
                  })
              })
            )
            .catch((error: unknown) =>
              this.notify({
                type: 'error',
                code: 'MATCH_PREPARATION_FAILED',
                message:
                  error instanceof Error
                    ? error.message
                    : 'Could not prepare match assets or launch Counter-Strike.'
              })
            )
        }
      } else if (parsed.type === 'match_cancelled') {
        clearMatchAssetPreload(parsed.matchId)
      } else if (parsed.type === 'match_finished' && !this.matchEndTimers.has(parsed.matchId)) {
        clearMatchAssetPreload(parsed.matchId)
        this.hostApiUrl = null
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
      // Only match_found is replayed during a host handoff. Countdown and ready-state
      // events intentionally repeat for the same match and must reach the renderer.
      if (parsed.type === 'match_found') {
        this.seenMatchEvents.add(`${parsed.type}:${parsed.matchId}`)
      }
      this.notify(parsed)
    })
    socket.addEventListener('close', () => {
      if (handoff && this.socket !== socket) {
        if (!this.manuallyDisconnected) {
          this.notify({
            type: 'error',
            code: 'HOST_HANDOFF_FAILED',
            message: 'Could not connect to the match region. Retrying…'
          })
          this.socket?.close()
        }
        return
      }
      if (this.socket !== socket) return
      this.socket = null
      this.authenticated = false
      this.recoveryStatusPending = false
      this.activeApiUrl = null
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = null
      this.notify({ type: 'connection_state', state: 'disconnected' })
      this.scheduleReconnect()
    })
  }

  private async selectApiUrl(
    nodes: Awaited<ReturnType<typeof getMatchmakingNodes>>,
    selectedNodeId: string | null
  ): Promise<string | null> {
    const selected = nodes.find((node) => node.id === selectedNodeId && node.available)
    if (selected) return selected.publicApiUrl
    const available = nodes.filter((node) => node.available)
    if (available.length === 0) return null
    const measurements = await Promise.all(
      available.map(async (node) => {
        const startedAt = performance.now()
        try {
          await fetch(node.publicApiUrl, { signal: AbortSignal.timeout(2_500) })
          return { node, latency: performance.now() - startedAt }
        } catch {
          return null
        }
      })
    )
    return (
      measurements
        .filter(
          (measurement): measurement is { node: (typeof available)[number]; latency: number } =>
            Boolean(measurement)
        )
        .sort((left, right) => left.latency - right.latency)[0]?.node.publicApiUrl ??
      available[0].publicApiUrl
    )
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN && this.authenticated)
        this.socket.send(JSON.stringify({ type: 'ping' }))
    }, PING_INTERVAL_MS)
  }

  private scheduleReconnect(): void {
    if (
      this.manuallyDisconnected ||
      this.reconnectTimer ||
      !this.renderer ||
      this.renderer.isDestroyed()
    )
      return
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt++,
      RECONNECT_MAX_DELAY_MS
    )
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket(true, this.hostApiUrl ?? undefined)
    }, delay)
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
