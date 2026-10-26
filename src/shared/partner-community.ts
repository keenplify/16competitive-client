export const PARTNER_SERVER_CHANNELS = {
  list: 'partner-servers:list',
  connect: 'partner-servers:connect',
  startGroup: 'partner-servers:start-group',
  pendingGroup: 'partner-servers:pending-group',
  getGroup: 'partner-servers:get-group',
  respondGroup: 'partner-servers:respond-group',
  markLaunched: 'partner-servers:mark-launched',
  presence: 'partner-servers:presence'
} as const
export const COMMUNITY_CHAT_CHANNELS = {
  members: 'community-chat:members',
  kickMember: 'community-chat:kick-member',
  history: 'community-chat:history',
  send: 'community-chat:send'
} as const
export const partnerSocialLabels = {
  discord: 'Discord',
  mastodon: 'Mastodon',
  koFi: 'Ko-fi',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  website: 'Website'
} as const
export type PartnerSocialLinks = Partial<Record<keyof typeof partnerSocialLabels, string>>
export interface PartnerServer {
  id: string
  name: string
  host: string
  port: number
  countryCode?: string | null
  category?:
    | 'pub'
    | 'zombie'
    | 'deathmatch'
    | 'gungame'
    | 'surf'
    | 'kz'
    | 'jailbreak'
    | 'awp'
    | 'aim'
    | 'other'
  gameVersion?: 'cs16' | 'cs13'
  imageUrl?: string | null
  imageUploaded?: boolean
}
export interface PartnerServerStatus extends PartnerServer {
  mapImageUrl?: string | null
  pingSource?: 'client' | 'api'
  online: boolean | null
  pingMs: number | null
  players: number | null
  maxPlayers: number | null
  map: string | null
}
// Local desktop clients may reach partner servers over LAN or a private VPN.
// Only literal RFC1918 addresses use this exception; DNS targets remain public-only.
export const isLocalPartnerIPv4 = (address: string): boolean => {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255))
    return false
  const [first, second] = parts.map(Number)
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}
export interface CommunityChatMessage {
  id: string
  sender: { id: string; username: string }
  message: string
  sentAt: string
}
export interface CommunityChatHistory {
  communityId: string | null
  name: string | null
  messages: CommunityChatMessage[]
}
export interface PartnerServersApi {
  list(communityId?: string): Promise<PartnerServerStatus[]>
  connect(id: string, groupId?: string, communityId?: string): Promise<void>
  startGroup(serverId: string): Promise<PartnerLaunchGroup>
  pendingGroup(): Promise<PartnerLaunchGroup | null>
  getGroup(groupId: string): Promise<PartnerLaunchGroup>
  respondGroup(groupId: string, accepted: boolean): Promise<PartnerLaunchGroup>
  markLaunched(groupId: string): Promise<void>
  presence(): Promise<PartnerPresence | null>
}
export interface PartnerPresence {
  connectionId: string
  server: PartnerServer
  team: number
  voiceMode: 'off' | 'ffa' | 'team'
  seenAt: string
}
export function parsePartnerPresence(input: unknown): PartnerPresence {
  if (!input || typeof input !== 'object') throw new Error('Invalid partner presence')
  const value = input as Record<string, unknown>
  if (
    typeof value.connectionId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(value.connectionId) ||
    typeof value.team !== 'number' ||
    !Number.isInteger(value.team) ||
    value.team < 0 ||
    value.team > 3 ||
    !['off', 'ffa', 'team'].includes(String(value.voiceMode)) ||
    typeof value.seenAt !== 'string' ||
    !Number.isFinite(Date.parse(value.seenAt))
  )
    throw new Error('Invalid partner presence')
  const server = parseCommunityBranding({ servers: [value.server] }).servers[0]
  return {
    connectionId: value.connectionId,
    server,
    team: value.team,
    voiceMode: value.voiceMode as PartnerPresence['voiceMode'],
    seenAt: value.seenAt
  }
}
export interface PartnerLaunchGroup {
  id: string
  server: PartnerServer
  leaderId: string
  status: 'pending' | 'ready' | 'cancelled'
  expiresAt: string
  members: { id: string; username: string; accepted: boolean | null; launched: boolean }[]
}
export function parsePartnerLaunchGroup(input: unknown): PartnerLaunchGroup {
  if (!input || typeof input !== 'object') throw new Error('Invalid party launch')
  const value = input as Record<string, unknown>
  const uuid = (id: unknown): id is string =>
    typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
  if (
    !uuid(value.id) ||
    !uuid(value.leaderId) ||
    !['pending', 'ready', 'cancelled'].includes(String(value.status)) ||
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    !Array.isArray(value.members) ||
    value.members.length < 2 ||
    value.members.length > 5 ||
    value.members.some((member: unknown) => {
      if (!member || typeof member !== 'object') return true
      const row = member as Record<string, unknown>
      return (
        !uuid(row.id) ||
        typeof row.username !== 'string' ||
        row.username.length > 64 ||
        ![true, false, null].includes(row.accepted as boolean | null) ||
        typeof row.launched !== 'boolean'
      )
    })
  )
    throw new Error('Invalid party launch')
  const server = parseCommunityBranding({ servers: [value.server] }).servers[0]
  return {
    id: value.id,
    server,
    leaderId: value.leaderId,
    status: value.status as PartnerLaunchGroup['status'],
    expiresAt: value.expiresAt,
    members: value.members as PartnerLaunchGroup['members']
  }
}
export interface CommunityChatApi {
  members(page: number, communityId?: string): Promise<CommunityMembers>
  kickMember(communityId: string, playerId: string): Promise<{ removed: true }>
  history(): Promise<CommunityChatHistory>
  send(communityId: string, message: string): Promise<CommunityChatMessage>
}
export function communityMembersPath(page: unknown, communityId?: unknown): string {
  if (
    typeof page !== 'number' ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    (communityId !== undefined && !uuid(communityId))
  )
    throw new Error('INVALID_COMMUNITY_PAGE')
  const query = new URLSearchParams({ page: String(page) })
  if (typeof communityId === 'string') query.set('communityId', communityId)
  return `/partners/community/members?${query}`
}
export interface CommunityMembers {
  communityId: string | null
  name: string | null
  members: {
    id: string
    username: string
    relationship: 'NONE' | 'OUTGOING' | 'INCOMING' | 'FRIEND'
  }[]
  total: number
  hasMore: boolean
  canKick: boolean
}
export function parseCommunityMembers(input: unknown): CommunityMembers {
  if (!input || typeof input !== 'object') throw new Error('Invalid community members')
  const v = input as Record<string, unknown>
  parseCommunityHistory({ communityId: v.communityId, name: v.name, messages: [] })
  if (
    !Array.isArray(v.members) ||
    v.members.length > 50 ||
    typeof v.total !== 'number' ||
    !Number.isInteger(v.total) ||
    v.total < 0 ||
    typeof v.hasMore !== 'boolean' ||
    (v.canKick !== undefined && typeof v.canKick !== 'boolean')
  )
    throw new Error('Invalid community members')
  const members = v.members.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid community member')
    const p = row as Record<string, unknown>
    if (!uuid(p.id) || typeof p.username !== 'string' || p.username.length > 64)
      throw new Error('Invalid community member')
    if (!['NONE', 'OUTGOING', 'INCOMING', 'FRIEND'].includes(String(p.relationship)))
      throw new Error('Invalid community relationship')
    return {
      id: p.id,
      username: p.username,
      relationship: p.relationship as 'NONE' | 'OUTGOING' | 'INCOMING' | 'FRIEND'
    }
  })
  if (v.communityId === null && members.length) throw new Error('Invalid community members')
  return {
    communityId: v.communityId as string | null,
    name: v.name as string | null,
    members,
    total: v.total,
    hasMore: v.hasMore,
    canKick: v.canKick === true
  }
}
export const validPartnerHost = (host: string): boolean =>
  host.length <= 253 &&
  (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
    ? host.split('.').every((part) => Number(part) <= 255)
    : host.includes('.') &&
      host.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)))
export const isPublicIPv4 = (address: string): boolean => {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) return false
  const [a, b, c] = address.split('.').map(Number)
  return (
    address.split('.').every((part) => Number(part) <= 255) &&
    a > 0 &&
    a < 224 &&
    ![10, 127].includes(a) &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0 || b === 2)) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) &&
    !(a === 203 && b === 0 && c === 113)
  )
}
export function parseCommunityBranding(value: Record<string, unknown>) {
  const communityName = value.communityName ?? null
  if (
    communityName !== null &&
    (typeof communityName !== 'string' ||
      !communityName.trim() ||
      [...communityName].length > 32 ||
      Array.from(communityName).some((char) => char.charCodeAt(0) < 32))
  )
    throw new Error('Invalid community name')
  const allowOtherCommunities =
    value.allowOtherCommunities === undefined ? true : value.allowOtherCommunities
  if (typeof allowOtherCommunities !== 'boolean')
    throw new Error('Invalid community discovery preference')
  const enabled = value.customSocialLinksEnabled ?? false
  if (typeof enabled !== 'boolean') throw new Error('Invalid social link preference')
  const links = value.socialLinks ?? {}
  if (!links || typeof links !== 'object' || Array.isArray(links))
    throw new Error('Invalid social links')
  const socialLinks: PartnerSocialLinks = {}
  for (const [key, href] of Object.entries(links)) {
    if (!Object.hasOwn(partnerSocialLabels, key) || typeof href !== 'string' || href.length > 2048)
      throw new Error('Invalid social link')
    const url = new URL(href)
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Invalid social link')
    socialLinks[key as keyof PartnerSocialLinks] = url.href
  }
  const rows = value.servers ?? []
  if (!Array.isArray(rows) || rows.length > 16) throw new Error('Invalid partner servers')
  const ids = new Set<string>(),
    endpoints = new Set<string>()
  const servers = rows.map((row: unknown): PartnerServer => {
    if (!row || typeof row !== 'object') throw new Error('Invalid partner server')
    const s = row as Record<string, unknown>
    if (
      typeof s.id !== 'string' ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s.id) ||
      ids.has(s.id) ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 64 ||
      Array.from(s.name).some((char) => char.charCodeAt(0) < 32) ||
      typeof s.host !== 'string' ||
      !validPartnerHost(s.host) ||
      typeof s.port !== 'number' ||
      !Number.isInteger(s.port) ||
      s.port < 1 ||
      s.port > 65535 ||
      (s.countryCode != null &&
        (typeof s.countryCode !== 'string' || !/^[A-Z]{2}$/.test(s.countryCode))) ||
      (s.category !== undefined &&
        ![
          'pub',
          'zombie',
          'deathmatch',
          'gungame',
          'surf',
          'kz',
          'jailbreak',
          'awp',
          'aim',
          'other'
        ].includes(String(s.category))) ||
      (s.gameVersion !== undefined && s.gameVersion !== 'cs16' && s.gameVersion !== 'cs13')
    )
      throw new Error('Invalid partner server')
    if (s.imageUrl !== undefined && s.imageUrl !== null) {
      if (typeof s.imageUrl !== 'string' || s.imageUrl.length > 2048)
        throw new Error('Invalid server image')
      const image = new URL(s.imageUrl)
      if (!['http:', 'https:'].includes(image.protocol) || image.username || image.password)
        throw new Error('Invalid server image')
    }
    if (s.imageUploaded !== undefined && typeof s.imageUploaded !== 'boolean')
      throw new Error('Invalid server image source')
    const endpoint = `${s.host.toLowerCase()}:${s.port}`
    if (endpoints.has(endpoint)) throw new Error('Duplicate partner server')
    ids.add(s.id)
    endpoints.add(endpoint)
    return {
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      ...(s.category !== undefined ? { category: s.category as PartnerServer['category'] } : {}),
      ...(s.countryCode !== undefined ? { countryCode: s.countryCode as string | null } : {}),
      gameVersion: (s.gameVersion ?? 'cs16') as 'cs16' | 'cs13',
      imageUrl: (s.imageUrl ?? null) as string | null,
      ...(s.imageUploaded !== undefined ? { imageUploaded: s.imageUploaded as boolean } : {})
    }
  })
  return {
    communityName: communityName as string | null,
    allowOtherCommunities,
    customSocialLinksEnabled: enabled,
    socialLinks,
    servers
  }
}
export const serverIsFull = (s: PartnerServerStatus): boolean =>
  s.players !== null && s.maxPlayers !== null && s.maxPlayers > 0 && s.players >= s.maxPlayers
export function parsePartnerServerStatuses(input: unknown): PartnerServerStatus[] {
  if (!input || typeof input !== 'object') throw new Error('Invalid server status')
  const rows = (input as { servers?: unknown }).servers
  const descriptors = parseCommunityBranding({ servers: rows }).servers
  if (!Array.isArray(rows)) throw new Error('Invalid server status')
  return descriptors.map((server, index) => {
    const row = rows[index] as Record<string, unknown>
    for (const key of ['players', 'maxPlayers', 'pingMs']) {
      const value = row[key]
      if (
        value !== null &&
        (typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 0 ||
          value > (key === 'pingMs' ? 60000 : 64))
      )
        throw new Error('Invalid server status')
    }
    if (
      typeof row.online !== 'boolean' ||
      row.pingSource !== 'api' ||
      (row.map !== null && (typeof row.map !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(row.map)))
    )
      throw new Error('Invalid server status')
    if (row.mapImageUrl != null) {
      if (typeof row.mapImageUrl !== 'string' || row.mapImageUrl.length > 2048)
        throw new Error('Invalid map image')
      const image = new URL(row.mapImageUrl)
      if (!['http:', 'https:'].includes(image.protocol) || image.username || image.password)
        throw new Error('Invalid map image')
    }
    return {
      ...server,
      ...(row.mapImageUrl !== undefined ? { mapImageUrl: row.mapImageUrl as string | null } : {}),
      online: row.online,
      pingSource: 'api',
      map: row.map as string | null,
      pingMs: row.pingMs as number | null,
      players: row.players as number | null,
      maxPlayers: row.maxPlayers as number | null
    }
  })
}
export const sortPartnerServers = (servers: PartnerServerStatus[]): PartnerServerStatus[] =>
  [...servers].sort(
    (a, b) =>
      Number(serverIsFull(a)) - Number(serverIsFull(b)) ||
      Number(a.online === false) - Number(b.online === false) ||
      (a.pingMs ?? Infinity) - (b.pingMs ?? Infinity) ||
      (b.players ?? -1) - (a.players ?? -1) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  )
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
export function parseCommunityMessage(input: unknown): CommunityChatMessage {
  if (!input || typeof input !== 'object') throw new Error('Invalid community message')
  const v = input as Record<string, unknown>,
    sender = v.sender as Record<string, unknown> | undefined
  if (
    !uuid(v.id) ||
    !sender ||
    !uuid(sender.id) ||
    typeof sender.username !== 'string' ||
    sender.username.length > 64 ||
    typeof v.message !== 'string' ||
    [...v.message].length > 300 ||
    typeof v.sentAt !== 'string' ||
    !Number.isFinite(Date.parse(v.sentAt))
  )
    throw new Error('Invalid community message')
  return {
    id: v.id,
    sender: { id: sender.id, username: sender.username },
    message: v.message,
    sentAt: v.sentAt
  }
}
export function parseCommunityHistory(input: unknown): CommunityChatHistory {
  if (!input || typeof input !== 'object') throw new Error('Invalid community history')
  const v = input as Record<string, unknown>
  if (
    (v.communityId !== null && !uuid(v.communityId)) ||
    (v.name !== null && (typeof v.name !== 'string' || [...v.name].length > 32)) ||
    !Array.isArray(v.messages) ||
    v.messages.length > 100
  )
    throw new Error('Invalid community history')
  if (v.communityId === null && v.messages.length) throw new Error('Invalid community history')
  return {
    communityId: v.communityId as string | null,
    name: v.name as string | null,
    messages: v.messages.map(parseCommunityMessage)
  }
}

export function partnerMapImageUrl(map: string | null, apiOrigin: string): string | null {
  return map && /^[a-z0-9_-]{1,64}$/i.test(map)
    ? new URL(`/partners/map-preview/${map.toLowerCase()}`, apiOrigin).toString()
    : null
}

export function serverArtworkSources(
  server: PartnerServerStatus,
  bundled?: string,
  registered?: string
): string[] {
  // Missing metadata from older backends retains the existing image priority.
  return [
    ...new Set(
      [
        server.imageUploaded !== false ? server.imageUrl : null,
        registered,
        bundled,
        server.mapImageUrl,
        server.imageUrl
      ].filter((source): source is string => Boolean(source))
    )
  ]
}
