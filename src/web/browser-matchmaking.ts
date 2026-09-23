import type {
  MatchmakingApi,
  MatchmakingEvent,
  MatchmakingMap,
  MatchmakingNode,
  MatchmakingPreferences,
  MatchmakingServerMessage
} from '../shared/matchmaking'
import { getWebSessionToken, requestJson } from './browser-session'

const ALLOW_EXPANSION_KEY = '16competitive.web.allow-region-expansion'
const SELECTED_NODE_KEY = '16competitive.web.selected-node'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const listeners = new Set<(event: MatchmakingEvent) => void>()
let socket: WebSocket | null = null
let connectPromise: Promise<void> | null = null
let resolveConnect: (() => void) | null = null
let rejectConnect: ((error: Error) => void) | null = null
let reconnectTimer: number | null = null
let heartbeatTimer: number | null = null
let authenticated = false
let navigating = false
let nodesCache: MatchmakingNode[] = []
let lastConnection: Extract<MatchmakingServerMessage, { type: 'match_connect' }> | null = null

const emit = (event: MatchmakingEvent): void => {
  for (const listener of listeners) listener(event)
}

const websocketUrl = (baseUrl = window.location.origin): string => {
  const url = new URL('/matchmaking/ws', baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const currentLanguage = (): string => {
  const language = navigator.language.toLowerCase().split('-')[0]
  return /^[a-z]{2,3}$/.test(language) ? language : 'en'
}

const send = (message: Record<string, unknown>): void => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error('Matchmaking is not connected')
  }
  socket.send(JSON.stringify(message))
}

const clearTimers = (): void => {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer)
  reconnectTimer = null
  heartbeatTimer = null
}

const sameOrigin = (url: string): boolean => {
  try {
    return new URL(url).origin === window.location.origin
  } catch {
    return false
  }
}

const createHandoffUrl = async (publicApiUrl: string): Promise<string> => {
  const target = new URL('/pwa/', publicApiUrl)
  if (!getWebSessionToken()) return target.toString()
  const handoff = await requestJson<{ token: string }>('/auth/web-handoff', {
    authenticated: true,
    init: { method: 'POST' }
  })
  target.searchParams.set('handoff', handoff.token)
  return target.toString()
}

const navigateToNode = async (publicApiUrl: string): Promise<void> => {
  if (sameOrigin(publicApiUrl)) return
  const targetUrl = await createHandoffUrl(publicApiUrl)
  navigating = true
  clearTimers()
  socket?.close()
  window.location.assign(targetUrl)
}

const steamLaunchUrl = (
  connection: Extract<MatchmakingServerMessage, { type: 'match_connect' }>
): string => {
  const args =
    `+setinfo "_16c" "${connection.joinToken}" +password "${connection.password}" +connect ${connection.host}:${connection.port}`
  return `steam://run/10//${encodeURIComponent(args)}/`
}

const launchCounterStrike = (): void => {
  if (!lastConnection) throw new Error('The match server is not ready yet.')
  window.location.href = steamLaunchUrl(lastConnection)
}

const handleMessage = async (message: MatchmakingServerMessage): Promise<void> => {
  if (message.type === 'connected') {
    const token = getWebSessionToken()
    if (!token) {
      rejectConnect?.(new Error('Sign in before connecting to matchmaking.'))
      return
    }
    send({
      type: 'authenticate',
      token,
      client: 'web',
      globalChatLanguage: currentLanguage()
    })
    return
  }

  if (message.type === 'party_presence_ping') {
    send({ type: 'party_presence_pong', nonce: message.nonce })
    emit(message)
    return
  }

  if (message.type === 'authenticated') {
    authenticated = true
    emit(message)
    emit({
      type: 'connection_endpoint',
      apiUrl: window.location.origin,
      websocketUrl: websocketUrl()
    })
    resolveConnect?.()
    resolveConnect = null
    rejectConnect = null
    connectPromise = null
    heartbeatTimer = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN && authenticated) {
        socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, 20_000)
    return
  }

  if (message.type === 'match_found' || message.type === 'match_roster') {
    emit(message)
    emit({
      type: 'match_assets_progress',
      matchId: message.matchId,
      status: 'ready',
      completedFiles: 0,
      totalFiles: 0
    })
    if (message.hostApiUrl && !sameOrigin(message.hostApiUrl)) {
      await navigateToNode(message.hostApiUrl)
    }
    return
  }

  if (message.type === 'match_connect') {
    lastConnection = message
    emit(message)
    return
  }

  emit(message)
}

const openSocket = (): Promise<void> => {
  if (socket?.readyState === WebSocket.OPEN && authenticated) return Promise.resolve()
  if (connectPromise) return connectPromise

  emit({ type: 'connection_state', state: socket ? 'reconnecting' : 'connecting' })
  authenticated = false
  socket?.close()
  socket = new WebSocket(websocketUrl())

  connectPromise = new Promise<void>((resolve, reject) => {
    resolveConnect = resolve
    rejectConnect = reject
  })

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(String(event.data)) as MatchmakingServerMessage
      void handleMessage(message).catch((error) => {
        console.error('[WebMatchmaking] event handling failed', error)
      })
    } catch {
      console.warn('[WebMatchmaking] ignored invalid websocket message')
    }
  })

  socket.addEventListener('error', () => {
    rejectConnect?.(new Error('Could not connect to matchmaking.'))
  })

  socket.addEventListener('close', () => {
    const pendingReject = rejectConnect
    authenticated = false
    connectPromise = null
    resolveConnect = null
    rejectConnect = null
    pendingReject?.(new Error('Matchmaking connection closed.'))
    if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer)
    heartbeatTimer = null
    if (navigating) return
    emit({ type: 'connection_state', state: 'disconnected' })
    if (getWebSessionToken()) {
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        void openSocket().catch(() => undefined)
      }, 1500)
    }
  })

  return connectPromise
}

const probeNode = async (node: MatchmakingNode): Promise<number | null> => {
  const samples: number[] = []
  for (let index = 0; index < 2; index += 1) {
    const started = performance.now()
    try {
      const url = new URL('/health', node.publicApiUrl)
      url.searchParams.set('webProbe', String(Date.now()) + String(index))
      await fetch(url, {
        mode: sameOrigin(node.publicApiUrl) ? 'cors' : 'no-cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(2500)
      })
      samples.push(performance.now() - started)
    } catch {
      // Leave unreachable nodes without a latency.
    }
  }
  if (!samples.length) return null
  samples.sort((a, b) => a - b)
  return Math.round(samples[Math.floor(samples.length / 2)]!)
}

const getNodes = async (): Promise<MatchmakingNode[]> => {
  const body = await requestJson<{ nodes: MatchmakingNode[] }>('/nodes')
  const measured = await Promise.all(
    body.nodes.map(async (node) => ({ ...node, latencyMs: await probeNode(node) }))
  )
  nodesCache = measured
  return measured
}

const preferences = (): MatchmakingPreferences => {
  const current = nodesCache.find((node) => sameOrigin(node.publicApiUrl))
  return {
    selectedNodeId: current?.id ?? localStorage.getItem(SELECTED_NODE_KEY),
    allowRegionExpansion: localStorage.getItem(ALLOW_EXPANSION_KEY) !== 'false'
  }
}

export const browserMatchmakingApi: MatchmakingApi = {
  connect: openSocket,

  getNodes,

  async selectNode(nodeId) {
    const nodes = nodesCache.length ? nodesCache : await getNodes()
    const target = nodeId ? nodes.find((node) => node.id === nodeId) : null
    if (nodeId && !target) throw new Error('Selected matchmaking region is unavailable.')
    if (nodeId) localStorage.setItem(SELECTED_NODE_KEY, nodeId)
    else localStorage.removeItem(SELECTED_NODE_KEY)
    if (target && !sameOrigin(target.publicApiUrl)) await navigateToNode(target.publicApiUrl)
    return preferences()
  },

  async getPreferences() {
    if (!nodesCache.length) await getNodes().catch(() => [])
    return preferences()
  },

  async setAllowRegionExpansion(value) {
    localStorage.setItem(ALLOW_EXPANSION_KEY, value ? 'true' : 'false')
    return preferences()
  },

  async joinQueue(mode, mapIds, allowRegionExpansion, preferredRegion, eligibleRegions) {
    if (mode !== 'unrated') {
      throw new Error('Ranked matchmaking requires the 1.6 Competitive desktop app.')
    }
    await openSocket()
    send({
      type: 'join_queue',
      mode,
      mapIds,
      allowRegionExpansion,
      ...(preferredRegion ? { preferredRegion } : {}),
      ...(eligibleRegions?.length ? { eligibleRegions } : {})
    })
  },

  async leaveQueue() {
    await openSocket()
    send({ type: 'leave_queue' })
  },

  async getQueueStatus() {
    await openSocket()
    send({ type: 'get_queue_status' })
  },

  async getMaps() {
    const body = await requestJson<{ maps: MatchmakingMap[] }>('/matchmaking/maps', {
      authenticated: true
    })
    return body.maps
  },

  async respondReady(matchId, accepted) {
    await openSocket()
    send({ type: 'match_ready_response', matchId, accepted })
  },

  async reconnectGame() {
    launchCounterStrike()
  },

  async reportPlayer(matchId, targetPlayerId, reason, description) {
    if (!UUID_PATTERN.test(matchId) || !UUID_PATTERN.test(targetPlayerId)) {
      throw new Error('Invalid match or player.')
    }
    await requestJson(`/matches/${matchId}/reports`, {
      authenticated: true,
      init: {
        method: 'POST',
        body: JSON.stringify({ targetPlayerId, reason, description: description.trim() })
      }
    })
  },

  async voiceJoin(context) {
    await openSocket()
    send({ type: 'voice_join', context })
  },

  async voiceLeave() {
    if (socket?.readyState === WebSocket.OPEN) send({ type: 'voice_leave' })
  },

  async voiceSignal(targetPlayerId, signalType, signal) {
    await openSocket()
    send({ type: 'voice_signal', targetPlayerId, signalType, signal })
  },

  onEvent(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}

export const browserPartyRealtime = {
  async sendMessage(message: string): Promise<void> {
    await openSocket()
    send({ type: 'party_chat_send', message: message.trim() })
  },
  async sendGlobalMessage(message: string, scope: 'global' | 'language'): Promise<void> {
    await openSocket()
    send({ type: 'global_chat_send', scope, message: message.trim() })
  },
  async setGlobalChatLanguage(language: string): Promise<void> {
    await openSocket()
    send({ type: 'global_chat_set_language', language })
  }
}

export const launchBrowserMatch = launchCounterStrike
