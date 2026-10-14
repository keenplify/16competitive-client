import { lookup } from 'node:dns/promises'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { getPartnerBranding } from './partner-branding'
import { getSessionToken } from './auth'
import { getSavedCs16Executable } from './game/game-settings'
import { resolveCs16LaunchTarget } from './game/cs16-installation'
import { launchOrdinaryCounterStrike } from './game/cs16-launcher'
import { matchmakingConnection } from './matchmaking'
import { queryServerInfo, type ServerInfo } from './game/partner-server-query'
import {
  isPublicIPv4,
  sortPartnerServers,
  type PartnerServer,
  type PartnerServerStatus
} from '../shared/partner-community'
async function publicAddress(host: string): Promise<string> {
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
async function probe(server: PartnerServer): Promise<PartnerServerStatus> {
  const fallback = {
    ...server,
    online: false,
    pingMs: null,
    players: null,
    maxPlayers: null,
    map: null
  }
  try {
    const address = await publicAddress(server.host)
    const samples: ServerInfo[] = []
    for (let i = 0; i < 3; i++) {
      const info = await queryServerInfo(address, server.port)
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
export async function listPartnerServers(): Promise<PartnerServerStatus[]> {
  const token = getSessionToken()
  if (!token) return []
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
      rows.push(...(await Promise.all(servers.slice(i, i + 4).map(probe))))
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
export async function connectPartnerServer(id: unknown): Promise<void> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('INVALID_SERVER')
  if (connecting || matchmakingConnection.isBusyForDemo()) throw new Error('MATCH_BUSY')
  connecting = true
  try {
    const token = getSessionToken()
    if (!token) throw new Error('SESSION_CHANGED')
    const { branding } = await getPartnerBranding(),
      server = branding?.servers.find((row) => row.id === id)
    if (!server) throw new Error('INVALID_SERVER')
    const address = await publicAddress(server.host)
    const executable = await getSavedCs16Executable()
    if (!executable) throw new Error('INSTALLATION_REQUIRED')
    const target = await resolveCs16LaunchTarget(executable)
    if (matchmakingConnection.isBusyForDemo()) throw new Error('MATCH_BUSY')
    await launchOrdinaryCounterStrike(async () => {
      if (getSessionToken() !== token || matchmakingConnection.isBusyForDemo())
        throw new Error('MATCH_BUSY')
      // Ordinary community session: no match ticket, module, anti-cheat or watchdog.
      const child = spawn(
        target.executable,
        [...target.argumentPrefix, '+connect', `${address}:${server.port}`],
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
  } finally {
    connecting = false
  }
}
