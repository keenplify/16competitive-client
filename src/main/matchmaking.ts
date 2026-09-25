import { ANTI_CHEAT_CANCELLED_MESSAGE, ANTI_CHEAT_NOTICE_GRACE_MS } from '../shared/anti-cheat'
import type { WebContents } from 'electron'
import { app, BrowserWindow, clipboard } from 'electron'
import {
  MATCHMAKING_CHANNELS,
  manualConnectionCommand,
  allowsManualMatchConnection
} from '../shared/matchmaking'
import type {
  MatchmakingEvent,
  MatchmakingMode,
  MatchmakingServerMessage,
  QueuedPlayer,
  VoiceContext,
  VoiceIceServer,
  VoiceSignalType
} from '../shared/matchmaking'
import type {
  GlobalChatMessage,
  GlobalChatMessageDeleted,
  GlobalChatScope
} from '../shared/matchmaking'
import { getSessionToken } from './auth'
import { MATCHMAKING_WS_URL, LOCAL_DEVELOPMENT } from './config'
import { allowsVoiceTransport, isLoopbackBackend } from './backend-policy'
import { createAutomaticMatchReporter } from './automatic-match-report'
import { reportDiagnosticIssue } from './diagnostic-logs'
import {
  getMatchmakingNodes,
  getMatchmakingPreferences,
  toMatchmakingWsUrl
} from './matchmaking-regions'
import {
  closeCounterStrikeForMatch,
  isCounterStrikeActiveForMatch,
  launchCounterStrikeForMatch
} from './game/cs16-launcher'
import {
  canUseMatchFastDlFallback,
  clearMatchAssetPreload,
  startMatchAssetPreload,
  startSkinAssetSync,
  waitForMatchAssetPreload
} from './game/match-assets'
import { API_BASE_URL } from './config'
import { getParty } from './party'
import { discordPresence } from './discord-presence'
type MatchConnection = Extract<MatchmakingServerMessage, { type: 'match_connect' }>

const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000
const CONNECTION_TIMEOUT_MS = 15_000
const MATCH_ASSET_FASTDL_WAIT_MS = 20_000
const PING_INTERVAL_MS = 20_000
const PONG_TIMEOUT_MS = 10_000
const MATCH_ATTENTION_DURATION_MS = 1_500
const MATCH_RESULT_GRACE_PERIOD_MS = 5_000

const isMode = (value: unknown): value is MatchmakingMode =>
  value === '5v5' || value === 'unrated' || value === 'casual'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isGlobalChatLanguage = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(value) && value.length <= 35
const isGlobalChatScope = (value: unknown): value is GlobalChatScope =>
  value === 'global' || value === 'language'
const hasValidGlobalChatRoom = (value: Record<string, unknown>): boolean =>
  value.scope === 'global'
    ? value.language === undefined
    : value.scope === 'language' && isGlobalChatLanguage(value.language)

const isMapId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value)
const isMapIds = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 32 &&
  value.every(isMapId) &&
  new Set(value).size === value.length

const isPreferredRegion = (value: unknown): value is string | null | undefined =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(value))

const isEligibleRegions = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 32 &&
  value.every((region) => isPreferredRegion(region) && typeof region === 'string') &&
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

const isVoiceContext = (value: unknown): value is VoiceContext => {
  if (typeof value !== 'object' || value === null) return false
  const context = value as Record<string, unknown>
  return (
    (context.kind === 'party' || context.kind === 'match') &&
    typeof context.id === 'string' &&
    context.id.length >= 1 &&
    context.id.length <= 80
  )
}

const isVoicePeer = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const peer = value as Record<string, unknown>
  return typeof peer.id === 'string' && typeof peer.username === 'string'
}

const isVoiceIceServer = (value: unknown): value is VoiceIceServer => {
  if (typeof value !== 'object' || value === null) return false
  const server = value as Record<string, unknown>
  const isIceUrl = (url: unknown): url is string =>
    typeof url === 'string' &&
    url.length >= 1 &&
    url.length <= 512 &&
    /^(stun|turn|turns):/.test(url)
  const urlsAreValid =
    isIceUrl(server.urls) ||
    (Array.isArray(server.urls) &&
      server.urls.length >= 1 &&
      server.urls.length <= 4 &&
      server.urls.every(isIceUrl))
  return (
    urlsAreValid &&
    (server.username === undefined ||
      (typeof server.username === 'string' && server.username.length <= 256)) &&
    (server.credential === undefined ||
      (typeof server.credential === 'string' && server.credential.length <= 512))
  )
}

const isVoiceSignalType = (value: unknown): value is VoiceSignalType =>
  value === 'offer' || value === 'answer' || value === 'ice'

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
    isGlobalChatScope(message.scope) &&
    hasValidGlobalChatRoom(message) &&
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

const isFriendChatMessage = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  return (
    typeof message.id === 'string' &&
    typeof message.recipientPlayerId === 'string' &&
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
  return (
    message.type === 'global_chat_message_deleted' &&
    typeof message.id === 'string' &&
    isGlobalChatScope(message.scope) &&
    hasValidGlobalChatRoom(message)
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

const isServerMessage = (value: unknown, endpoint: string): value is MatchmakingServerMessage => {
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
    case 'voice_session':
      return (
        isVoiceContext(message.context) &&
        Array.isArray(message.peers) &&
        message.peers.length <= 19 &&
        message.peers.every(isVoicePeer) &&
        Array.isArray(message.iceServers) &&
        message.iceServers.every(isVoiceIceServer) &&
        allowsVoiceTransport(message.iceTransportPolicy, message.iceServers.length, endpoint)
      )
    case 'voice_peer_joined':
      return isVoiceContext(message.context) && isVoicePeer(message.peer)
    case 'voice_peer_left':
      return isVoiceContext(message.context) && typeof message.playerId === 'string'
    case 'voice_signal':
      return (
        isVoiceContext(message.context) &&
        typeof message.fromPlayerId === 'string' &&
        isVoiceSignalType(message.signalType) &&
        typeof message.signal === 'string' &&
        message.signal.length >= 1 &&
        message.signal.length <= 24_000
      )
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
    case 'friend_request_received':
    case 'friends_updated':
      return true
    case 'skin_gift_available':
      return typeof message.giftId === 'string' && uuidPattern.test(message.giftId)
    case 'friend_chat_message':
      return isFriendChatMessage(message.message)
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
        isGlobalChatScope(message.scope) &&
        hasValidGlobalChatRoom(message) &&
        Array.isArray(message.messages) &&
        message.messages.length <= 100 &&
        message.messages.every(isGlobalChatMessage) &&
        message.messages.every(
          (entry) =>
            entry.scope === message.scope &&
            (message.scope === 'global' || entry.language === message.language)
        )
      )
    case 'match_found':
    case 'match_roster': {
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
        (message.connectionFailed === undefined || typeof message.connectionFailed === 'boolean') &&
        typeof message.matchId === 'string' &&
        typeof message.reason === 'string' &&
        [
          'PLAYER_DECLINED',
          'PLAYER_NOT_READY',
          'SERVER_START_FAILED',
          'PLAYER_DID_NOT_CONNECT'
        ].includes(message.reason) &&
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
  private readonly reportConnectionFailure = createAutomaticMatchReporter(reportDiagnosticIssue)
  private socket: WebSocket | null = null
  private socketOpening = false
  private renderer: WebContents | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private desiredMode: MatchmakingMode | null = null
  private desiredMapIds: string[] = []
  private desiredAllowRegionExpansion = true
  private desiredPreferredRegion: string | null = null
  private desiredEligibleRegions: string[] = []
  private globalChatLanguage = 'en'
  private activeApiUrl: string | null = null
  private hostApiUrl: string | null = null
  private reconnectAttempt = 0
  private restartReconnectAtMs = 0
  private seenMatchEvents = new Set<string>()
  private cancelledMatchIds = new Set<string>()
  private fastDlMatchIds = new Set<string>()
  private finishedMatchIds = new Set<string>()
  private manuallyDisconnected = false
  private freshProcess = true
  private authenticated = false
  private recoveryStatusPending = false
  private lastConnection: MatchConnection | null = null
  private manualConnectionMatchId: string | null = null
  private matchEndTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private matchAttentionTimer: ReturnType<typeof setTimeout> | null = null
  private matchAttentionWindow: BrowserWindow | null = null
  private restoreMatchWindowTopmost = false

  getActiveApiUrl(): string | null {
    return this.activeApiUrl ?? this.hostApiUrl
  }

  connect(renderer: WebContents): void {
    this.renderer = renderer
    this.manuallyDisconnected = false
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
    this.desiredPreferredRegion = null
    this.lastConnection = null
    this.manualConnectionMatchId = null
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

  shutdown(): void {
    this.manuallyDisconnected = true
    this.authenticated = false
    this.recoveryStatusPending = false
    this.desiredMode = null
    this.desiredMapIds = []
    this.desiredPreferredRegion = null
    this.lastConnection = null
    this.manualConnectionMatchId = null
    this.activeApiUrl = null
    this.hostApiUrl = null
    this.reconnectAttempt = 0
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.stopPing()
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ type: 'leave_queue' }))
      } catch {
        // The process is already shutting down; the disconnect fallback applies.
      }
    }
    this.socket?.close()
    this.socket = null
    this.renderer = null
  }

  joinQueue(
    mode: unknown,
    mapIds: unknown,
    allowRegionExpansion: unknown,
    preferredRegion: unknown,
    eligibleRegions: unknown
  ): void {
    if (!isMode(mode)) throw new Error('Unsupported matchmaking mode')
    if (!isMapIds(mapIds)) throw new Error('Select at least one valid matchmaking map')
    if (typeof allowRegionExpansion !== 'boolean')
      throw new Error('Invalid regional search preference')
    if (!isPreferredRegion(preferredRegion)) throw new Error('Invalid matchmaking region')
    if (!isEligibleRegions(eligibleRegions)) throw new Error('Invalid eligible matchmaking regions')
    this.desiredMode = mode
    this.desiredMapIds = [...mapIds]
    this.desiredAllowRegionExpansion = allowRegionExpansion
    this.desiredPreferredRegion = preferredRegion ?? null
    this.desiredEligibleRegions = [...eligibleRegions]
    this.send({
      type: 'join_queue',
      mode,
      mapIds,
      allowRegionExpansion,
      eligibleRegions,
      ...(preferredRegion ? { preferredRegion } : {})
    })
  }

  leaveQueue(): void {
    this.desiredMode = null
    this.desiredMapIds = []
    this.desiredPreferredRegion = null
    this.desiredEligibleRegions = []
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

  sendGlobalMessage(message: unknown, scope: unknown): void {
    if (typeof message !== 'string' || message.trim().length === 0 || message.length > 300) {
      throw new Error('Chat messages must contain 1-300 characters')
    }
    if (!isGlobalChatScope(scope)) throw new Error('Invalid chat room')
    this.send({ type: 'global_chat_send', scope, message: message.trim() })
  }

  setGlobalChatLanguage(language: unknown): void {
    if (!isGlobalChatLanguage(language)) throw new Error('Invalid global chat language')
    this.globalChatLanguage = language
    if (this.socket?.readyState === WebSocket.OPEN && this.authenticated) {
      this.send({ type: 'global_chat_set_language', language })
    }
  }

  joinVoice(context: unknown): void {
    if (!isVoiceContext(context)) throw new Error('Invalid voice channel')
    this.send({ type: 'voice_join', context })
  }

  leaveVoice(): void {
    // Leaving voice is best-effort. The renderer tears a voice session down when
    // a match ends, when the dock unmounts and while signing out, all of which
    // can happen after the socket is already gone. Rejecting those calls only
    // produced "Error occurred in handler for 'matchmaking:voice-leave'" noise
    // because there is nothing left to leave.
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.send({ type: 'voice_leave' })
  }

  sendVoiceSignal(targetPlayerId: unknown, signalType: unknown, signal: unknown): void {
    if (
      typeof targetPlayerId !== 'string' ||
      targetPlayerId.length < 1 ||
      targetPlayerId.length > 80
    ) {
      throw new Error('Invalid voice peer')
    }
    if (!isVoiceSignalType(signalType)) throw new Error('Invalid voice signal type')
    if (typeof signal !== 'string' || signal.length < 1 || signal.length > 24_000) {
      throw new Error('Invalid voice signal')
    }
    this.send({ type: 'voice_signal', targetPlayerId, signalType, signal })
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
    if (isCounterStrikeActiveForMatch(connection.matchId)) {
      console.info('[GameLaunch] ignored reconnect while Counter-Strike is already active', {
        matchId: connection.matchId
      })
      return
    }
    if (!this.fastDlMatchIds.has(connection.matchId)) {
      await this.waitForMatchAssetsOrFastDl(
        connection.matchId,
        this.prepareMatchAssets(connection.matchId)
      )
    }
    await launchCounterStrikeForMatch({
      ...connection,
      forceRestart: true,
      onVoicePtt: (active) => this.notifyLocalVoicePtt(connection.matchId, active),
      onExit: ({ code, signal }) => {
        discordPresence.setInGame(false)
        this.focusLauncher()
        this.notify({ type: 'game_process_exited', matchId: connection.matchId, code, signal })
      }
    })
    discordPresence.setInGame(true)
  }

  async copyConnection(matchId: unknown): Promise<void> {
    if (typeof matchId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(matchId)) {
      throw new Error('Invalid match connection request')
    }
    if (
      this.lastConnection?.matchId !== matchId ||
      this.cancelledMatchIds.has(matchId) ||
      this.finishedMatchIds.has(matchId)
    ) {
      throw new Error('This match is no longer available')
    }
    if (this.manualConnectionMatchId !== matchId)
      throw new Error('Ranked matches require the desktop launcher.')
    const apiUrl = this.hostApiUrl ?? this.activeApiUrl
    const token = getSessionToken()
    if (!apiUrl || !token) throw new Error('Reconnect to matchmaking before copying the command')
    if (!this.fastDlMatchIds.has(matchId)) {
      await this.waitForMatchAssetsOrFastDl(matchId, this.prepareMatchAssets(matchId))
    }
    const response = await fetch(
      `${apiUrl.replace(/\/$/, '')}/matchmaking/matches/${encodeURIComponent(matchId)}/manual-connection`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000)
      }
    )
    if (!response.ok) throw new Error('Could not activate manual connection. Please retry.')
    const value: unknown = await response.json()
    // This token only works after the server has added it to its match-local allowlist.
    clipboard.writeText(manualConnectionCommand(value))
  }

  async reportPlayer(
    matchId: unknown,
    targetPlayerId: unknown,
    reason: unknown,
    description: unknown
  ): Promise<void> {
    if (
      typeof matchId !== 'string' ||
      !uuidPattern.test(matchId) ||
      typeof targetPlayerId !== 'string' ||
      !uuidPattern.test(targetPlayerId) ||
      !['CHEATING', 'GRIEFING', 'TOXIC_COMMUNICATION', 'AFK_THROWING', 'OTHER'].includes(
        String(reason)
      ) ||
      typeof description !== 'string' ||
      description.trim().length < 3 ||
      description.trim().length > 300
    ) {
      throw new Error('Choose a reason and enter 3 to 300 characters before reporting.')
    }
    const token = getSessionToken()
    if (!token) throw new Error('Sign in before reporting a player.')
    const baseUrl = this.activeApiUrl ?? this.hostApiUrl ?? API_BASE_URL
    const response = await fetch(new URL(`/matches/${matchId}/reports`, baseUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ targetPlayerId, reason, description: description.trim() }),
      signal: AbortSignal.timeout(10_000)
    })
    if (response.ok) return
    const body: unknown = await response.json().catch(() => null)
    const code = body && typeof body === 'object' && 'error' in body ? String(body.error) : ''
    if (code === 'ALREADY_REPORTED') throw new Error('You have already reported this player.')
    if (code === 'MATCH_NOT_LIVE') throw new Error('This match is no longer live.')
    if (code === 'PLAYER_NOT_IN_MATCH') throw new Error('This player is not in your match.')
    throw new Error('Could not submit the report. Please try again.')
  }

  private refreshDiscordPartyPresence(): void {
    void getParty()
      .then((party) => discordPresence.setParty(party))
      .catch((error: unknown) => {
        console.warn(
          '[DiscordPresence] could not refresh party state',
          error instanceof Error ? error.message : String(error)
        )
      })
  }

  private prepareMatchAssets(matchId: string): Promise<void> {
    const hostApiUrl = this.hostApiUrl ?? this.activeApiUrl
    if (!hostApiUrl) throw new Error('The match asset server is unavailable.')
    return startMatchAssetPreload(matchId, hostApiUrl, (progress) => {
      if (!this.fastDlMatchIds.has(matchId)) {
        this.notify({ type: 'match_assets_progress', matchId, ...progress })
      }
    })
  }

  private async waitForMatchAssetsOrFastDl(
    matchId: string,
    assetsReady: Promise<void>
  ): Promise<void> {
    let fallbackTimer: ReturnType<typeof setInterval> | null = null
    const deadline = Date.now() + MATCH_ASSET_FASTDL_WAIT_MS
    const fastDlReady = new Promise<'fastdl'>((resolve) => {
      fallbackTimer = setInterval(() => {
        if (Date.now() >= deadline && canUseMatchFastDlFallback(matchId)) resolve('fastdl')
      }, 1_000)
    })
    let reason = 'launcher download exceeded the wait limit'
    try {
      const result = await Promise.race([assetsReady.then(() => 'ready' as const), fastDlReady])
      if (result === 'ready') {
        if (this.fastDlMatchIds.delete(matchId)) {
          this.notify({
            type: 'match_assets_progress',
            matchId,
            status: 'ready',
            completedFiles: 0,
            totalFiles: 0
          })
        }
        return
      }
    } catch (error) {
      if (!canUseMatchFastDlFallback(matchId)) throw error
      reason = error instanceof Error ? error.message : String(error)
    } finally {
      if (fallbackTimer) clearInterval(fallbackTimer)
    }
    this.fastDlMatchIds.add(matchId)
    console.warn('[MatchAssets] using in-game resource download', { matchId, reason })
    clearMatchAssetPreload(matchId)
    this.notify({
      type: 'match_assets_progress',
      matchId,
      status: 'fastdl',
      completedFiles: 0,
      totalFiles: 0
    })
  }

  private focusLauncher(urgent = false): void {
    const window = this.renderer ? BrowserWindow.fromWebContents(this.renderer) : null
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    if (urgent) {
      if (this.matchAttentionWindow !== window) {
        if (this.matchAttentionTimer) clearTimeout(this.matchAttentionTimer)
        if (this.matchAttentionWindow && !this.matchAttentionWindow.isDestroyed()) {
          if (this.restoreMatchWindowTopmost) this.matchAttentionWindow.setAlwaysOnTop(false)
        }
        this.restoreMatchWindowTopmost = !window.isAlwaysOnTop()
        this.matchAttentionWindow = window
      }
      if (this.restoreMatchWindowTopmost) window.setAlwaysOnTop(true, 'screen-saver')
      if (this.matchAttentionTimer) clearTimeout(this.matchAttentionTimer)
      this.matchAttentionTimer = setTimeout(() => {
        this.matchAttentionTimer = null
        if (!window.isDestroyed() && this.restoreMatchWindowTopmost) window.setAlwaysOnTop(false)
        this.matchAttentionWindow = null
        this.restoreMatchWindowTopmost = false
      }, MATCH_ATTENTION_DURATION_MS)
      window.moveTop()
    }
    app.focus({ steal: urgent })
    window.focus()
  }

  private openSocket(reconnecting: boolean, apiUrl?: string, handoff = false): void {
    if (this.socketOpening) return
    const token = getSessionToken()
    if (!token) throw new Error('Sign in before connecting to matchmaking')
    this.socketOpening = true
    this.notify({
      type: 'connection_state',
      state: handoff ? 'handoff' : reconnecting ? 'reconnecting' : 'connecting'
    })
    void this.createSocket(token, apiUrl, handoff).then(
      () => {
        this.socketOpening = false
      },
      () => {
        this.socketOpening = false
      }
    )
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
      if (LOCAL_DEVELOPMENT && !isLoopbackBackend(websocketUrl))
        throw new Error('Local development cannot connect to a remote matchmaking node')
      socket = new WebSocket(websocketUrl)
    } catch (error) {
      console.warn('[Matchmaking] could not create WebSocket connection', error)
      if (handoff) {
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
      if (!isServerMessage(parsed, websocketUrl)) {
        this.notify({ type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid server message' })
        return
      }
      if (parsed.type === 'pong') {
        this.clearPongTimeout()
        return
      }
      if (parsed.type === 'server_restarting') {
        this.desiredMode = null
        this.desiredMapIds = []
        this.recoveryStatusPending = false
        this.restartReconnectAtMs = Date.now() + parsed.retryAfterMs
        this.notify(parsed)
        this.handleSocketDisconnect(socket)
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
      if (parsed.type === 'match_found' || parsed.type === 'match_roster') {
        this.manualConnectionMatchId = allowsManualMatchConnection(parsed.mode)
          ? parsed.matchId
          : null
      }
      if (parsed.type === 'match_ready_check' && Date.parse(parsed.deadline) <= Date.now()) return
      if (
        parsed.type === 'match_found' &&
        this.seenMatchEvents.has(`${parsed.type}:${parsed.matchId}`)
      ) {
        return
      }
      if (parsed.type === 'connected') {
        socket.send(
          JSON.stringify({
            type: 'authenticate',
            token,
            globalChatLanguage: this.globalChatLanguage,
            client: 'desktop'
          })
        )
        return
      }
      if (parsed.type === 'party_presence_ping') {
        socket.send(JSON.stringify({ type: 'party_presence_pong', nonce: parsed.nonce }))
        return
      }
      if (parsed.type === 'authenticated') {
        socketAuthenticated = true
        discordPresence.setAuthenticated(true)
        this.refreshDiscordPartyPresence()
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
                allowRegionExpansion: this.desiredAllowRegionExpansion,
                eligibleRegions: this.desiredEligibleRegions,
                ...(this.desiredPreferredRegion
                  ? { preferredRegion: this.desiredPreferredRegion }
                  : {})
              })
            )
          }
        }
        this.startPing()
        this.notify({ type: 'connection_endpoint', apiUrl: this.activeApiUrl, websocketUrl })
        void startSkinAssetSync(this.activeApiUrl ?? API_BASE_URL, (progress) =>
          this.notify({ type: 'skin_assets_sync_progress', ...progress })
        ).catch((error: unknown) => {
          console.warn('[Matchmaking] background skin asset sync failed', error)
        })
      } else if (parsed.type === 'queue_status' || parsed.type === 'match_ready_check') {
        this.recoveryStatusPending = false
        if (parsed.type === 'queue_status') {
          discordPresence.setQueue(parsed.mode, parsed.mapIds)
        }
        if (parsed.type === 'match_ready_check') {
          this.freshProcess = false
          this.focusLauncher(true)
        }
        if (parsed.type === 'queue_status' && this.freshProcess) {
          this.freshProcess = false
          socket.send(JSON.stringify({ type: 'leave_queue' }))
        }
      } else if (parsed.type === 'queue_joined') {
        this.freshProcess = false
        discordPresence.setQueue(parsed.mode, parsed.mapIds)
        this.desiredMode = parsed.mode
        this.desiredMapIds = [...parsed.mapIds]
        this.desiredAllowRegionExpansion = parsed.allowRegionExpansion
        this.desiredPreferredRegion = parsed.region
      } else if (parsed.type === 'queue_left') {
        discordPresence.clearQueue()
        this.desiredMode = null
        this.desiredMapIds = []
        this.desiredPreferredRegion = null
      } else if (
        parsed.type === 'error' &&
        (parsed.code === 'MAP_NOT_FOUND' ||
          parsed.code === 'MAP_MODE_UNSUPPORTED' ||
          parsed.code === 'SERVER_RESTARTING')
      ) {
        this.desiredMode = null
        this.desiredMapIds = []
        this.desiredPreferredRegion = null
      } else if (parsed.type === 'match_found') {
        this.freshProcess = false
        discordPresence.setMatch(parsed.mode, parsed.mapId)
        this.desiredMode = null
        this.desiredMapIds = []
        this.desiredPreferredRegion = null
        this.focusLauncher(true)
        const needsHostHandoff = parsed.hostApiUrl !== this.activeApiUrl
        this.hostApiUrl = parsed.hostApiUrl
        if (needsHostHandoff) {
          this.authenticated = false
          this.openSocket(false, parsed.hostApiUrl, true)
        }
        void startMatchAssetPreload(parsed.matchId, parsed.hostApiUrl, (progress) =>
          this.fastDlMatchIds.has(parsed.matchId)
            ? undefined
            : this.notify({ type: 'match_assets_progress', matchId: parsed.matchId, ...progress })
        ).catch((error: unknown) =>
          this.cancelledMatchIds.has(parsed.matchId) ||
          this.fastDlMatchIds.has(parsed.matchId) ||
          canUseMatchFastDlFallback(parsed.matchId)
            ? undefined
            : this.notify({
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
        const assetsReady = isRecoveredConnection
          ? this.prepareMatchAssets(parsed.matchId)
          : waitForMatchAssetPreload(parsed.matchId)
        void this.waitForMatchAssetsOrFastDl(parsed.matchId, assetsReady)
          .then(async () => {
            if (
              this.cancelledMatchIds.has(parsed.matchId) ||
              this.finishedMatchIds.has(parsed.matchId)
            ) {
              return
            }
            await launchCounterStrikeForMatch({
              ...parsed,
              onVoicePtt: (active) => this.notifyLocalVoicePtt(parsed.matchId, active),
              onExit: ({ code, signal }) => {
                discordPresence.setInGame(false)
                this.focusLauncher()
                this.notify({
                  type: 'game_process_exited',
                  matchId: parsed.matchId,
                  code,
                  signal
                })
              }
            })
            discordPresence.setInGame(true)
          })
          .catch((error: unknown) => {
            if (
              this.cancelledMatchIds.has(parsed.matchId) ||
              this.finishedMatchIds.has(parsed.matchId)
            ) {
              return
            }
            this.notify({
              type: 'error',
              code: 'MATCH_PREPARATION_FAILED',
              message:
                error instanceof Error
                  ? error.message
                  : 'Could not prepare match assets or launch Counter-Strike.'
            })
          })
      } else if (parsed.type === 'match_cancelled') {
        void this.reportConnectionFailure(parsed)
        discordPresence.finishMatch()
        const firstCancellation = !this.cancelledMatchIds.has(parsed.matchId)
        this.cancelledMatchIds.add(parsed.matchId)
        this.fastDlMatchIds.delete(parsed.matchId)
        this.lastConnection = null
        this.manualConnectionMatchId = null
        clearMatchAssetPreload(parsed.matchId)
        this.hostApiUrl = null
        if (parsed.message === ANTI_CHEAT_CANCELLED_MESSAGE) {
          if (firstCancellation) {
            const existingTimer = this.matchEndTimers.get(parsed.matchId)
            if (existingTimer) clearTimeout(existingTimer)
            const timer = setTimeout(() => {
              this.matchEndTimers.delete(parsed.matchId)
              closeCounterStrikeForMatch(parsed.matchId)
              this.focusLauncher()
            }, ANTI_CHEAT_NOTICE_GRACE_MS)
            this.matchEndTimers.set(parsed.matchId, timer)
            this.focusLauncher()
          }
        } else {
          closeCounterStrikeForMatch(parsed.matchId)
          this.focusLauncher()
        }
      } else if (parsed.type === 'match_finished' && !this.matchEndTimers.has(parsed.matchId)) {
        discordPresence.finishMatch()
        this.finishedMatchIds.add(parsed.matchId)
        this.fastDlMatchIds.delete(parsed.matchId)
        this.lastConnection = null
        this.manualConnectionMatchId = null
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
      if (parsed.type === 'match_found') {
        this.seenMatchEvents.add(`${parsed.type}:${parsed.matchId}`)
      }
      if (parsed.type === 'party_updated') {
        this.refreshDiscordPartyPresence()
      } else if (parsed.type === 'party_disbanded') {
        discordPresence.setParty(null)
      }
      this.notify(parsed)
    })
    socket.addEventListener('error', () => {
      console.warn('[Matchmaking] WebSocket connection error')
      if (!handoff) this.handleSocketDisconnect(socket)
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
      if (
        !socket ||
        socket.readyState !== WebSocket.OPEN ||
        !this.authenticated ||
        this.pongTimer
      ) {
        return
      }
      try {
        socket.send(JSON.stringify({ type: 'ping' }))
      } catch {
        console.warn('[Matchmaking] heartbeat send failed; reconnecting')
        this.handleSocketDisconnect(socket)
        socket.close()
        return
      }
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

  private notifyLocalVoicePtt(matchId: string, active: boolean): void {
    this.notify({
      type: 'voice_signal',
      context: { kind: 'match', id: matchId },
      fromPlayerId: '__16competitive_ptt__',
      signalType: 'ice',
      signal: JSON.stringify({ type: 'ptt', active })
    })
  }
}

export const matchmakingConnection = new MatchmakingConnection()
