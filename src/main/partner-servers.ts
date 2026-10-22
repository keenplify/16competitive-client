import { resolveServiceApiUrl } from './matchmaking-regions'
import { validateCommunityJoin } from '../shared/community-directory'
import { API_BASE_URL } from './config'
import { parsePartnerLaunchTicket, partnerLaunchArguments } from '../shared/partner-launch'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { LegacyGameService } from './game/legacy-game-service'
import { cs13Adapter } from './game/adapters/cs13'
import { getPartnerBranding } from './partner-branding'
import { getSessionPlayerId, getSessionToken } from './auth'
import { getSavedCs16Executable } from './game/game-settings'
import { resolveCs16LaunchTarget } from './game/cs16-installation'
import { launchOrdinaryCounterStrike } from './game/cs16-launcher'
import { launchPartnerHtmlGame } from './game/partner-html-launch'
import { matchmakingConnection } from './matchmaking'
import { queryServerInfo, type ServerInfo } from './game/partner-server-query'
import {
  partnerMapImageUrl,
  isPublicIPv4,
  isLocalPartnerIPv4,
  parsePartnerLaunchGroup,
  parsePartnerPresence,
  sortPartnerServers,
  type PartnerLaunchGroup,
  type PartnerPresence,
  type PartnerServer,
  type PartnerServerStatus
} from '../shared/partner-community'
async function serverAddress(host: string): Promise<string> {
  if (isIP(host) === 4) {
    if (isPublicIPv4(host) || isLocalPartnerIPv4(host)) return host
    throw new Error('SERVER_ADDRESS_REJECTED')
  }
  let timeout: ReturnType<typeof setTimeout> | undefined
  const addresses = await Promise.race([
    lookup(host, { family: 4, all: true }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('SERVER_UNAVAILABLE')), 3000)
    })
  ]).finally(() => clearTimeout(timeout))
  if (!addresses.length || addresses.some((row) => !isPublicIPv4(row.address)))
    throw new Error('SERVER_ADDRESS_REJECTED')
  return addresses[0].address
}
async function probe(server: PartnerServer, apiOrigin: string): Promise<PartnerServerStatus> {
  const fallback = {
    ...server,
    online: false,
    pingMs: null,
    players: null,
    maxPlayers: null,
    map: null
  }
  try {
    const address = await serverAddress(server.host)
    const samples: ServerInfo[] = []
    for (let i = 0; i < 3; i++) {
      const info = await queryServerInfo(
        address,
        server.port,
        900,
        server.gameVersion === 'cs13' ? 'cs13' : 'cs16'
      )
      if (info) samples.push(info)
      else if (!samples.length) break
    }
    if (!samples.length) return fallback
    const latest = samples[samples.length - 1]
    return {
      ...server,
      online: true,
      pingSource: 'client',
      ...latest,
      mapImageUrl: partnerMapImageUrl(latest.map, apiOrigin),
      pingMs: Math.round(samples.reduce((sum, sample) => sum + sample.pingMs, 0) / samples.length)
    }
  } catch {
    return fallback
  }
}
let cache: { token: string | null; at: number; rows: PartnerServerStatus[] } | null = null
let pending: Promise<PartnerServerStatus[]> | null = null
let cacheGeneration = 0
export function invalidatePartnerServerCache(): void {
  cacheGeneration++
  cache = null
}
export async function listPartnerServers(communityId?: string): Promise<PartnerServerStatus[]> {
  if (communityId !== undefined) {
    validateCommunityJoin(communityId, null)
    const token = getSessionToken()
    if (!token) return []
    const apiOrigin = await resolveServiceApiUrl()
    const { branding } = await getPartnerBranding(communityId)
    const servers = branding?.servers ?? []
    const rows: PartnerServerStatus[] = []
    for (let i = 0; i < servers.length; i += 4)
      rows.push(
        ...(await Promise.all(servers.slice(i, i + 4).map((server) => probe(server, apiOrigin))))
      )
    if (getSessionToken() !== token) throw new Error('SESSION_CHANGED')
    return sortPartnerServers(rows)
  }
  const token = getSessionToken()
  if (!token) return []
  const apiOrigin = await resolveServiceApiUrl()
  if (cache?.token === token && Date.now() - cache.at < 15000) return cache.rows
  if (pending) {
    await pending
    if (getSessionToken() !== token) throw new Error('SESSION_CHANGED')
    if (cache?.token === token) return cache.rows
  }
  const generation = cacheGeneration
  pending = (async () => {
    const { branding } = await getPartnerBranding()
    const servers = branding?.servers ?? [],
      rows: PartnerServerStatus[] = []
    // Bound parallel UDP traffic; each reachable server contributes three samples.
    for (let i = 0; i < servers.length; i += 4)
      rows.push(
        ...(await Promise.all(servers.slice(i, i + 4).map((server) => probe(server, apiOrigin))))
      )
    if (getSessionToken() !== token) throw new Error('SESSION_CHANGED')
    const sorted = sortPartnerServers(rows)
    if (generation === cacheGeneration) cache = { token, at: Date.now(), rows: sorted }
    return sorted
  })()
  try {
    return await pending
  } finally {
    pending = null
  }
}
let connecting = false
async function groupRequest(path: string, body?: Record<string, unknown>): Promise<unknown> {
  const token = getSessionToken()
  if (!token) throw new Error('SESSION_CHANGED')
  const response = await fetch(new URL(path, API_BASE_URL), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`PARTY_LAUNCH_FAILED:${response.status}`)
  if (getSessionToken() !== token) throw new Error('SESSION_CHANGED')
  return response.json()
}
export async function startPartnerGroup(serverId: unknown): Promise<PartnerLaunchGroup> {
  if (typeof serverId !== 'string' || !/^[0-9a-f-]{36}$/i.test(serverId))
    throw new Error('INVALID_SERVER')
  return parsePartnerLaunchGroup(
    await groupRequest(`/partners/servers/${serverId}/party-launch`, {})
  )
}
export async function pendingPartnerGroup(): Promise<PartnerLaunchGroup | null> {
  const response = await groupRequest('/partners/launch/pending')
  return response === null ? null : parsePartnerLaunchGroup(response)
}
export async function currentPartnerPresence(): Promise<PartnerPresence | null> {
  const response = await groupRequest('/partners/play/presence')
  return response === null ? null : parsePartnerPresence(response)
}
export async function getPartnerGroup(groupId: unknown): Promise<PartnerLaunchGroup> {
  if (typeof groupId !== 'string' || !/^[0-9a-f-]{36}$/i.test(groupId))
    throw new Error('INVALID_GROUP')
  return parsePartnerLaunchGroup(await groupRequest(`/partners/launch/${groupId}`))
}
export async function respondPartnerGroup(
  groupId: unknown,
  accepted: unknown
): Promise<PartnerLaunchGroup> {
  if (
    typeof groupId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(groupId) ||
    typeof accepted !== 'boolean'
  )
    throw new Error('INVALID_GROUP')
  return parsePartnerLaunchGroup(
    await groupRequest(`/partners/launch/${groupId}/response`, { accepted })
  )
}
export async function markPartnerGroupLaunched(groupId: unknown): Promise<void> {
  if (typeof groupId !== 'string' || !/^[0-9a-f-]{36}$/i.test(groupId))
    throw new Error('INVALID_GROUP')
  await groupRequest(`/partners/launch/${groupId}/launched`, {})
}
async function requestPartnerLaunchTicket(
  id: string,
  token: string
): Promise<{ ticket: string | null; connectionId: string | null }> {
  const response = await fetch(new URL(`/partners/servers/${id}/launch-ticket`, API_BASE_URL), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error('SERVER_LINK_UNAVAILABLE')
  const body: unknown = await response.json()
  const ticket = parsePartnerLaunchTicket(body)
  const connectionId =
    body &&
    typeof body === 'object' &&
    'connectionId' in body &&
    typeof body.connectionId === 'string' &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.connectionId)
      ? body.connectionId
      : null
  return { ticket, connectionId }
}
export async function connectPartnerServer(
  id: unknown,
  groupId?: unknown,
  communityId?: string
): Promise<void> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('INVALID_SERVER')
  if (communityId !== undefined) validateCommunityJoin(communityId, null)
  if (connecting || matchmakingConnection.isBusyForPartnerServer()) throw new Error('MATCH_BUSY')
  connecting = true
  try {
    const token = getSessionToken()
    if (!token) throw new Error('SESSION_CHANGED')
    const group = groupId === undefined ? null : await getPartnerGroup(groupId)
    if (
      group &&
      (group.status !== 'ready' ||
        group.server.id !== id ||
        !group.members.some((member) => member.id === getSessionPlayerId() && member.accepted))
    )
      throw new Error('GROUP_NOT_READY')
    const { branding } = group ? { branding: null } : await getPartnerBranding(communityId),
      server = group?.server ?? branding?.servers.find((row) => row.id === id)
    if (!server) throw new Error('INVALID_SERVER')
    const address = await serverAddress(server.host)
    if (server.gameVersion === 'cs13') {
      const profile = await new LegacyGameService({
        settingsPath: join(app.getPath('userData'), 'cs13-installation.json'),
        platform: process.platform,
        chooseFolder: async () => null,
        isBusy: () => matchmakingConnection.isBusyForPartnerServer(),
        launch: async () => undefined
      }).get()
      if (!profile.ok || !profile.value.installation) throw new Error('INSTALLATION_REQUIRED')
      const plan = cs13Adapter.buildMenuLaunchPlan(profile.value.installation)
      const { ticket } = await requestPartnerLaunchTicket(id, token)
      await launchOrdinaryCounterStrike(async () => {
        if (getSessionToken() !== token || matchmakingConnection.isBusyForPartnerServer())
          throw new Error('MATCH_BUSY')
        const child = spawn(
          plan.executable,
          [...plan.args, ...partnerLaunchArguments(address, server.port, ticket)],
          {
            cwd: plan.cwd,
            shell: false,
            detached: true,
            stdio: 'ignore'
          }
        )
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', () => reject(new Error('LAUNCH_FAILED')))
        })
        child.unref()
      })
      if (group) await markPartnerGroupLaunched(group.id)
      return
    }
    const executable = await getSavedCs16Executable()
    if (!executable) throw new Error('INSTALLATION_REQUIRED')
    const target = await resolveCs16LaunchTarget(executable)
    const { ticket, connectionId } = await requestPartnerLaunchTicket(id, token)
    if (matchmakingConnection.isBusyForPartnerServer()) throw new Error('MATCH_BUSY')
    await launchOrdinaryCounterStrike(async () => {
      if (getSessionToken() !== token || matchmakingConnection.isBusyForPartnerServer())
        throw new Error('MATCH_BUSY')
      // Ordinary community session. The single-use link ticket grants only partner session identity.
      if (
        await launchPartnerHtmlGame(
          id,
          address,
          server.port,
          ticket,
          connectionId,
          target,
          () => getSessionToken() === token && !matchmakingConnection.isBusyForPartnerServer()
        )
      )
        return
      const child = spawn(
        target.executable,
        [...target.argumentPrefix, ...partnerLaunchArguments(address, server.port, ticket)],
        {
          cwd:
            target.distribution === 'steam' && process.platform === 'win32'
              ? dirname(target.executable)
              : dirname(executable),
          shell: false,
          detached: true,
          stdio: 'ignore'
        }
      )
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', () => reject(new Error('LAUNCH_FAILED')))
      })
      child.unref()
      console.info('[PartnerServers] ordinary game launched', { serverId: id })
    })
    if (group) await markPartnerGroupLaunched(group.id)
  } finally {
    connecting = false
  }
}
