import type { WebContents } from 'electron'
import { BrowserWindow } from 'electron'
import { MATCHMAKING_CHANNELS } from '../shared/matchmaking'
import type {
  MatchmakingEvent,
  MatchmakingMode,
  MatchmakingServerMessage,
  QueuedPlayer
} from '../shared/matchmaking'
import type { GlobalChatMessage, GlobalChatMessageDeleted } from '../shared/matchmaking'
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
const CONNECTION_TIMEOUT_MS = 15_000
const PING_INTERVAL_MS = 20_000
const PONG_TIMEOUT_MS = 10_000
const MATCH_RESULT_GRACE_PERIOD_MS = 5_000

const isMode = (value: unknown): value is MatchmakingMode => value === '5v5' || value === 'casual'
const isMapId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value)
const isMapIds = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 32 &&
  value.every(isMapId) &&
  new Set(value).size === value.length

const isOptionalTimestamp = (value: unknown): value is string | undefined =>
  value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)))

const isOptionalSearchStage = (value: unknown): boolean =>
  value === undefined || value === 'LOCAL' || value === 'EXPANDED' || value === 'BOT_FILL'

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
    typeof player.assists === 'number' &&
    Number.isInteger(player.mmrBefore) &&
    Number.isInteger(player.mmrAfter) &&
    Number.isInteger(player.mmrChange)
  )
}

const isGlobalChatMessage = (value: unknown): value is GlobalChatMessage => {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  return (
    message.type === 'global_chat_message' &&
    typeof message.id === 'string' &&
    typeof message.message === 'string' &&
    message.message.length >= 1 &&
    message.message.length <= 300 &&
    typeof message.sentAt === 'string' &&
    typeof message.sender === 'object' &&
    message.sender !== null &&
    typeof (message.sender as Record<string, unknown>).id === 'string' &&
    typeof (message.sender as Record<string, unknown>).username === 'string'
  )
}

const isGlobalChatMessageDeleted = (value: unknown): value is GlobalChatMessageDeleted => {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  return message.type === 'global_chat_message_deleted' && typeof message.id === 'string'
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
    case 'server_restarting':
      return (
        typeof message.message === 'string' &&
        typeof message.restartInMs === 'number' &&
        Number.isInteger(message.restartInMs) &&
        message.restartInMs >= 0 &&
        typeof message.retryAfterMs === 'number' &&
        Number.isInteger(message.retryAfterMs) &&
        message.retryAfterMs >= 0
      )
    case 'authenticated':
      return isPlayer(message.player)
    case 'queue_joined':
      return (
        isMode(message.mode) &&
        isMapIds(message.mapIds) &&
        typeof message.region === 'string' &&
        typeof message.allowRegionExpansion === 'boolean' &&
        isOptionalTimestamp(message.queuedAt) &&
        isOptionalTimestamp(message.autoFillAt) &&
        isOptionalSearchStage(message.searchStage)
      )
    case 'queue_left':
      return isMode(message.mode) && isMapIds(message.mapIds)
    case 'queue_status':
      return (
        isMode(message.mode) &&
        isMapIds(message.mapIds) &&
        typeof message.queuedPlayers === 'number' &&
        typeof message.playersRequired === 'number' &&
        typeof message.position === 'number' &&
        typeof message.region === 'string' &&
        typeof message.allowRegionExpansion === 'boolean' &&
        isOptionalTimestamp(message.queuedAt) &&
        isOptionalTimestamp(message.autoFillAt) &&
        isOptionalSearchStage(message.searchStage)
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
    case 'global_chat_message':
      return isGlobalChatMessage(message)
    case 'global_chat_message_deleted':
      return isGlobalChatMessageDeleted(message)
    case 'global_chat_history':
      return (
        Array.isArray(message.messages) &&
        message.messages.length <= 100 &&
        message.messages.every(isGlobalChatMessage)
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
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private desiredMode: MatchmakingMode | null = null
  private desiredMapIds: string[] = []
  private desiredAllowRegionExpansion = true
  private activeApiUrl: string | null = null
  private hostApiUrl: string | null = null
  private reconnectAttempt = 0
  private restartReconnectAtMs = 0
  private seenMatchEvents = new Set<string>()
  private cancelledMatchIds = new Set<string>()
  private finishedMatchIds = new Set<string>()
  private manuallyDisconnected = false
  private authenticated = false
  private recoveryStatusPending = false
  private lastConnection: MatchConnection | null = null
  private matchEndTimers = new Map<string, ReturnType<typeof setTimeout>>()

  connect(renderer: WebContents): void {
    this.renderer = renderer
    this.manuallyDisconnected = false

    // An explicit retry (for example, after the OS reports that the network
    // is back) should replace any delayed exponential retry, not race it.
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null

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
    this.desiredMapIds = []
    this.lastConnection = null
    this.activeApiUrl = null
    this.hostApiUrl = null
    this.reconnectAttempt = 0
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.stopPing()
    this.socket?.close()
    this.socket = null
    this.renderer = null
  }

  joinQueue(mode: unknown, mapIds: unknown, allowRegionExpansion: unknown): void {
    if (!isMode(mode)) throw new Error('Unsupported matchmaking mode')
    if (!isMapIds(mapIds)) throw new Error('Select at least one valid matchmaking map')
    if (typeof allowRegionExpansion !== 'boolean')
      throw new Error('Invalid regional search preference')
    this.desiredMode = mode
    this.desiredMapIds = [...mapIds]
    this.desiredAllowRegionExpansion = allowRegionExpansion
    this.send({ type: 'join_queue', mode, mapIds, allowRegionExpansion })
  }

  leaveQueue(): void {
    this.desiredMode = null
    this.desiredMapIds = []
    this.send({ type: 'leave_queue' })
  }

  getQueueStatus(): void {
    this.send({ type: 'get_queue_status' })
  }

  sendPartyMessage(message: unknown): void {
    if (typeof message !== 'string' || message.trim().length === 0 || message.length > 300) {
      throw new Error('Party messages must contain 1-300 characters')
    }
    this.send({ type: 'party_chat_send', message: message.trim() })
  }

  sendGlobalMessage(message: unknown): void {
    if (typeof message !== 'string' || message.trim().length === 0 || message.length > 300) {
      throw new Error('Global messages must contain 1-300 characters')
    }
    this.send({ type: 'global_chat_send', message: message.trim() })
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
      forceRestart: true,
      onExit: ({ code, signal }) => {
        this.focusLauncher()
        this.notify({ type: 'game_process_exited', matchId: connection.matchId, code, signal })
      }
    })
  }

  private prepareMatchAssets(matchId: string): Promise<void> {
    const hostApiUrl = this.activeApiUrl ?? this.hostApiUrl
    if (!hostApiUrl) throw new Error('The match asset server is unavailable.')
    return startMatchAssetPreload(matchId, hostApiUrl, (progress) =>
      this.notify({ type: 'match_assets_progress', matchId, ...progress })
    )
  }

  private focusLauncher(): void {
    const window = this.renderer ? BrowserWindow.fromWebContents(this.renderer) : null
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
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
    let socket: WebSocket
    try {
      socket = new WebSocket(websocketUrl)
    } catch (error) {
      console.warn('[Matchmaking] could not create WebSocket connection', error)
      if (handoff) {
        // Closing the current socket enters the normal reconnect path and
        // avoids leaving the launcher stuck on an unreachable match host.
        this.socket?.close()
      } else {
        this.notify({ type: 'connection_state', state: 'reconnecting' })
        this.scheduleReconnect()
      }
      return
    }
    if (!handoff) this.socket = socket
    let socketAuthenticated = false
    const connectionTimeout = setTimeout(() => {
      if (socketAuthenticated || socket.readyState === WebSocket.CLOSED) return
      console.warn('[Matchmaking] connection handshake timed out; reconnecting')
      socket.close()
    }, CONNECTION_TIMEOUT_MS)
    connectionTimeout.unref?.()

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
      if (parsed.type === 'pong') {
        this.clearPongTimeout()
        return
      }
      if (parsed.type === 'server_restarting') {
        // A deployment explicitly cancels its queue and matches. Do not carry a
        // desired queue over the reconnect, or the launcher could immediately
        // requeue someone the deployment just removed.
        this.desiredMode = null
        this.desiredMapIds = []
        this.recoveryStatusPending = false
        this.restartReconnectAtMs = Date.now() + parsed.retryAfterMs
        if (this.lastConnection) {
          clearMatchAssetPreload(this.lastConnection.matchId)
          closeCounterStrikeForMatch(this.lastConnection.matchId)
          this.lastConnection = null
        }
        this.notify(parsed)
        socket.close()
        return
      }
      if (
        'matchId' in parsed &&
        typeof parsed.matchId === 'string' &&
        (this.cancelledMatchIds.has(parsed.matchId) || this.finishedMatchIds.has(parsed.matchId))
      ) {
        return
      }
      if (parsed.type === 'match_ready_check' && Date.parse(parsed.deadline) <= Date.now()) {
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
        socketAuthenticated = true
        clearTimeout(connectionTimeout)
        if (handoff) {
          const oldSocket = this.socket
          this.socket = socket
          this.hostApiUrl = targetApiUrl ?? null
          this.activeApiUrl = targetApiUrl ?? null
          this.authenticated = true
          this.recoveryStatusPending = true
          socket.send(JSON.stringify({ type: 'get_queue_status' }))
          oldSocket?.close()
        } else {
          this.authenticated = true
          this.activeApiUrl = targetApiUrl ?? null
          this.reconnectAttempt = 0
          this.recoveryStatusPending = true
          socket.send(JSON.stringify({ type: 'get_queue_status' }))
          if (this.desiredMode && this.desiredMapIds.length > 0) {
            socket.send(
              JSON.stringify({
                type: 'join_queue',
                mode: this.desiredMode,
                mapIds: this.desiredMapIds,
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
        this.desiredMapIds = [...parsed.mapIds]
        this.desiredAllowRegionExpansion = parsed.allowRegionExpansion
      } else if (parsed.type === 'queue_left') {
        this.desiredMode = null
        this.desiredMapIds = []
      } else if (
        parsed.type === 'error' &&
        (parsed.code === 'MAP_NOT_FOUND' || parsed.code === 'MAP_MODE_UNSUPPORTED')
      ) {
        this.desiredMode = null
        this.desiredMapIds = []
      } else if (parsed.type === 'match_found') {
        this.desiredMode = null
        this.desiredMapIds = []
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
        // A fresh launcher has no in-memory preload, while socket recovery in
        // the same process may already have one. Both paths must continue into
        // launch after verification; launchCounterStrikeForMatch makes replayed
        // match_connect delivery idempotent within the current app process.
        const assetsReady = isRecoveredConnection
          ? this.prepareMatchAssets(parsed.matchId)
          : waitForMatchAssetPreload(parsed.matchId)
        void assetsReady
          .then(() =>
            launchCounterStrikeForMatch({
              ...parsed,
              onExit: ({ code, signal }) => {
                this.focusLauncher()
                this.notify({
                  type: 'game_process_exited',
                  matchId: parsed.matchId,
                  code,
                  signal
                })
              }
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
      } else if (parsed.type === 'match_cancelled') {
        this.cancelledMatchIds.add(parsed.matchId)
        this.lastConnection = null
        clearMatchAssetPreload(parsed.matchId)
      } else if (parsed.type === 'match_finished' && !this.matchEndTimers.has(parsed.matchId)) {
        this.finishedMatchIds.add(parsed.matchId)
        this.lastConnection = null
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
    socket.addEventListener('error', () => {
      // Some network stacks only report an error for a failed TCP/TLS attempt.
      // Explicitly closing guarantees that the close handler schedules recovery.
      if (socket.readyState !== WebSocket.CLOSED) socket.close()
    })
    socket.addEventListener('close', () => {
      clearTimeout(connectionTimeout)
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
      this.handleSocketDisconnect(socket)
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
    this.stopPing()

    const ping = (): void => {
      const socket = this.socket
      if (!socket || socket.readyState !== WebSocket.OPEN || !this.authenticated || this.pongTimer) {
        return
      }

      socket.send(JSON.stringify({ type: 'ping' }))
      this.pongTimer = setTimeout(() => {
        if (this.socket !== socket || !this.authenticated) return
        console.warn('[Matchmaking] heartbeat timed out; reconnecting')
        this.pongTimer = null
        this.handleSocketDisconnect(socket)
        socket.close()
      }, PONG_TIMEOUT_MS)
    }

    ping()
    this.pingTimer = setInterval(ping, PING_INTERVAL_MS)
  }

  private clearPongTimeout(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer)
    this.pongTimer = null
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.clearPongTimeout()
  }

  private handleSocketDisconnect(socket: WebSocket): void {
    if (this.socket !== socket) return
    this.socket = null
    this.authenticated = false
    this.recoveryStatusPending = false
    this.stopPing()
    if (this.manuallyDisconnected) return
    this.notify({ type: 'connection_state', state: 'reconnecting' })
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (
      this.manuallyDisconnected ||
      this.reconnectTimer ||
      !this.renderer ||
      this.renderer.isDestroyed()
    )
      return
    const retryDelay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt++,
      RECONNECT_MAX_DELAY_MS
    )
    const delay = Math.max(retryDelay, this.restartReconnectAtMs - Date.now(), 0)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket(true, this.hostApiUrl ?? this.activeApiUrl ?? undefined)
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
