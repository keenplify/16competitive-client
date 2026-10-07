import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { createSocket } from 'node:dgram'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getSessionToken } from './auth'
import { API_BASE_URL, LOCAL_DEVELOPMENT } from './config'
import { isLoopbackBackend } from './backend-policy'
import type { MatchmakingNode, MatchmakingPreferences } from '../shared/matchmaking'

type MeasuredMatchmakingNode = MatchmakingNode & { latencyMs: number | null }

const LATENCY_PROBE_TIMEOUT_MS = 1_500
const MAX_PREFERRED_LATENCY_MS = 300
const FALLBACK_NODE_DISCOVERY_ORIGINS = [
  'https://euw.16competitive.papamo.dev',
  'https://na.16competitive.papamo.dev',
  'https://sa.16competitive.papamo.dev'
] as const

const preferencesPath = (): string => join(app.getPath('userData'), 'matchmaking-preferences.json')

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isApiUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}

const isLatencyProbe = (value: unknown): value is NonNullable<MatchmakingNode['latencyProbe']> => {
  if (!isObject(value)) return false
  const { host, port } = value
  return (
    typeof host === 'string' &&
    host.length > 0 &&
    host.length <= 253 &&
    typeof port === 'number' &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65_535
  )
}

const isPlayWindow = (value: unknown): value is NonNullable<MatchmakingNode['playWindow']> => {
  if (
    !isObject(value) ||
    typeof value.timeZone !== 'string' ||
    value.timeZone.length === 0 ||
    value.timeZone.length > 64 ||
    typeof value.startsAt !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.startsAt) ||
    typeof value.endsAt !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.endsAt) ||
    value.startsAt === value.endsAt ||
    typeof value.bonusPoints !== 'number' ||
    !Number.isSafeInteger(value.bonusPoints) ||
    value.bonusPoints <= 0 ||
    value.bonusPoints > 10_000
  )
    return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone })
    return true
  } catch {
    return false
  }
}

const isNode = (value: unknown): value is MatchmakingNode =>
  isObject(value) &&
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  value.id.length <= 80 &&
  typeof value.region === 'string' &&
  value.region.length > 0 &&
  value.region.length <= 32 &&
  isApiUrl(value.publicApiUrl) &&
  (value.playWindow === undefined || value.playWindow === null || isPlayWindow(value.playWindow)) &&
  (value.latencyProbe === undefined || isLatencyProbe(value.latencyProbe)) &&
  typeof value.capacity === 'number' &&
  Number.isFinite(value.capacity) &&
  typeof value.activeConnections === 'number' &&
  Number.isFinite(value.activeConnections) &&
  typeof value.activeMatches === 'number' &&
  Number.isFinite(value.activeMatches) &&
  typeof value.available === 'boolean'

const measuredLatency = (node: MatchmakingNode): number | null => {
  const latencyMs = (node as Partial<MeasuredMatchmakingNode>).latencyMs
  return typeof latencyMs === 'number' && Number.isFinite(latencyMs) ? latencyMs : null
}

const isUsablePreference = (node: MatchmakingNode): boolean => {
  const latencyMs = measuredLatency(node)
  return node.available && latencyMs !== null && Math.round(latencyMs) < MAX_PREFERRED_LATENCY_MS
}

const probeUdpLatency = (
  probe: NonNullable<MatchmakingNode['latencyProbe']>
): Promise<number | null> =>
  new Promise((resolve) => {
    const socket = createSocket('udp4')
    const nonce = randomBytes(16)
    const startedAt = performance.now()
    let settled = false
    const finish = (latencyMs: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.close()
      resolve(latencyMs)
    }
    const timeout = setTimeout(() => finish(null), LATENCY_PROBE_TIMEOUT_MS)
    socket.once('error', () => finish(null))
    socket.on('message', (message) => {
      if (message.length === nonce.length && message.equals(nonce)) {
        finish(Math.max(0, Math.round(performance.now() - startedAt)))
      }
    })
    socket.send(nonce, probe.port, probe.host, (error) => {
      if (error) finish(null)
    })
  })

const probeNodeLatency = async (node: MatchmakingNode): Promise<number | null> => {
  if (!node.available) return null
  if (node.latencyProbe) {
    const latencyMs = await probeUdpLatency(node.latencyProbe)
    if (latencyMs !== null) return latencyMs
  }
  const startedAt = performance.now()
  try {
    await fetch(node.publicApiUrl, { signal: AbortSignal.timeout(2_500) })
    return Math.max(0, Math.round(performance.now() - startedAt))
  } catch {
    return null
  }
}

const attachNodeLatencies = async (nodes: MatchmakingNode[]): Promise<MatchmakingNode[]> =>
  Promise.all(
    nodes.map(async (node) => ({
      ...node,
      latencyMs: await probeNodeLatency(node)
    }))
  )

const reportNodeLatencies = async (nodes: MatchmakingNode[], token: string): Promise<void> => {
  const measurements = nodes.flatMap((node) => {
    const latencyMs = measuredLatency(node)
    return latencyMs === null ? [] : [{ region: node.region, latencyMs }]
  })
  if (measurements.length === 0) return
  try {
    await fetch(`${API_BASE_URL}/auth/latency-observations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ measurements }),
      signal: AbortSignal.timeout(2_500)
    })
  } catch {
    // Ping reporting is operational telemetry only. Never block region selection.
  }
}

export const getMatchmakingPreferences = async (): Promise<MatchmakingPreferences> => {
  try {
    const value: unknown = JSON.parse(await readFile(preferencesPath(), 'utf8'))
    if (!isObject(value)) throw new Error('Invalid preferences')
    return {
      selectedNodeId: typeof value.selectedNodeId === 'string' ? value.selectedNodeId : null,
      allowRegionExpansion:
        typeof value.allowRegionExpansion === 'boolean' ? value.allowRegionExpansion : true
    }
  } catch {
    return { selectedNodeId: null, allowRegionExpansion: true }
  }
}

export const saveMatchmakingPreferences = async (
  update: Partial<MatchmakingPreferences>
): Promise<MatchmakingPreferences> => {
  const preferences = { ...(await getMatchmakingPreferences()), ...update }
  const destination = preferencesPath()
  const temporary = `${destination}.tmp`
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, destination)
  return preferences
}

export const getOnlinePlayers = async (): Promise<number> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before loading online players')
  const response = await fetch(`${API_BASE_URL}/online-players`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  })
  const body: unknown = await response.json().catch(() => null)
  if (
    !response.ok ||
    !isObject(body) ||
    typeof body.onlinePlayers !== 'number' ||
    !Number.isInteger(body.onlinePlayers) ||
    body.onlinePlayers < 0
  ) {
    throw new Error('Could not load online player count')
  }
  return body.onlinePlayers
}

export const getMatchmakingNodes = async (measureLatency = true): Promise<MatchmakingNode[]> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before loading regions')
  const fetchNodes = async (origin: string, timeoutMs: number): Promise<MatchmakingNode[]> => {
    const response = await fetch(`${origin}/nodes`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs)
    })
    const body: unknown = await response.json().catch(() => null)
    if (
      !response.ok ||
      !isObject(body) ||
      !Array.isArray(body.nodes) ||
      !body.nodes.every(isNode)
    ) {
      throw new Error('The regional matchmaking service returned invalid nodes')
    }
    return body.nodes
  }
  let discoveredNodes: MatchmakingNode[]
  try {
    discoveredNodes = await fetchNodes(API_BASE_URL, LOCAL_DEVELOPMENT ? 10_000 : 3_500)
  } catch {
    if (LOCAL_DEVELOPMENT) throw new Error('Could not reach the regional matchmaking service')
    try {
      discoveredNodes = await Promise.any(
        FALLBACK_NODE_DISCOVERY_ORIGINS.map((origin) => fetchNodes(origin, 5_000))
      )
    } catch {
      throw new Error('Could not reach the regional matchmaking service')
    }
  }
  const nodes = LOCAL_DEVELOPMENT
    ? discoveredNodes.filter((node) => isLoopbackBackend(node.publicApiUrl))
    : discoveredNodes
  if (!measureLatency) return nodes
  const measuredNodes = await attachNodeLatencies(nodes)
  const { selectedNodeId } = await getMatchmakingPreferences()
  if (
    selectedNodeId &&
    !measuredNodes.some((node) => node.id === selectedNodeId && isUsablePreference(node))
  ) {
    await saveMatchmakingPreferences({ selectedNodeId: null })
  }
  void reportNodeLatencies(measuredNodes, token)
  return measuredNodes
}

export const selectMatchmakingApiUrl = async (
  nodes: MatchmakingNode[],
  selectedNodeId: string | null
): Promise<string | null> => {
  const selected = nodes.find((node) => node.id === selectedNodeId && isUsablePreference(node))
  if (selected) return selected.publicApiUrl

  const available = nodes.filter((node) => node.available)
  if (available.length === 0) return null

  const alreadyMeasured = available
    .map((node) => ({ node, latency: measuredLatency(node) }))
    .filter(
      (measurement): measurement is { node: MatchmakingNode; latency: number } =>
        measurement.latency !== null
    )
    .sort((left, right) => left.latency - right.latency)

  if (alreadyMeasured.length > 0) return alreadyMeasured[0].node.publicApiUrl

  const measurements = await Promise.all(
    available.map(async (node) => ({ node, latency: await probeNodeLatency(node) }))
  )

  return (
    measurements
      .filter(
        (measurement): measurement is { node: MatchmakingNode; latency: number } =>
          measurement.latency !== null
      )
      .sort((left, right) => left.latency - right.latency)[0]?.node.publicApiUrl ?? null
  )
}

export const resolvePreferredMatchmakingApiUrl = async (): Promise<string> => {
  try {
    const [nodes, preferences] = await Promise.all([
      getMatchmakingNodes(),
      getMatchmakingPreferences()
    ])
    return (await selectMatchmakingApiUrl(nodes, preferences.selectedNodeId)) ?? API_BASE_URL
  } catch {
    return API_BASE_URL
  }
}

export const toMatchmakingWsUrl = (apiUrl: string): string => {
  if (!isApiUrl(apiUrl)) throw new Error('Invalid regional matchmaking API URL')
  const url = new URL(apiUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/matchmaking/ws'
  url.search = ''
  url.hash = ''
  return url.toString()
}
