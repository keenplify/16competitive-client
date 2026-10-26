import type { PartnerServer } from './partner-community'

export const SERVER_CATEGORIES = [
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
] as const
export type ServerCategory = (typeof SERVER_CATEGORIES)[number]
export const COMMUNITY_DIRECTORY_CHANNELS = {
  list: 'communities:list',
  join: 'communities:join',
  leave: 'communities:leave',
  update: 'communities:update',
  ownerSettings: 'communities:owner-settings',
  uploadServerImage: 'communities:upload-server-image'
} as const
export interface CommunityCard {
  id: string
  name: string
  description: string
  imageUrl: string | null
  categories: ServerCategory[]
  countries: string[]
  serverCount: number
  memberCount: number | null
  canLeave?: boolean
}
export interface CommunityDirectoryQuery {
  cursor: string | null
  search: string
  category: ServerCategory | ''
  country: string
}
export interface CommunityDirectoryResult {
  preferredCommunity?: CommunityCard | null
  currentCommunity: CommunityCard | null
  communities: CommunityCard[]
  currentCommunityId: string | null
  canBypassLeaveRestriction: boolean
  viewerCountryCode: string | null
  nextCursor: string | null
}
export interface CommunityDirectoryApi {
  list(query: CommunityDirectoryQuery): Promise<CommunityDirectoryResult>
  leave(expectedCommunityId: string): Promise<{ left: true }>
  join(
    id: string,
    expectedCommunityId: string | null
  ): Promise<{ joined: true; communityId: string }>
  update(input: CommunityUpdate): Promise<{ saved: true }>
  ownerSettings(): Promise<CommunityUpdate>
  uploadServerImage(id: string, bytes: Uint8Array): Promise<{ imageUrl: string }>
}
export interface CommunityUpdate {
  name: string
  communityCountryCode: string | null
  description: string
  servers: PartnerServer[]
}
export function communityUpdateBody(input: CommunityUpdate) {
  return {
    communityName: input.name.trim(),
    communityCountryCode: input.communityCountryCode,
    description: input.description,
    servers: input.servers.map(({ id, name, host, port, category, countryCode, gameVersion }) => ({
      id,
      name,
      host,
      port,
      category,
      countryCode,
      gameVersion
    }))
  }
}
export function validateServerImageUpload(id: unknown, bytes: unknown): asserts id is string {
  if (
    !uuid(id) ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 12 ||
    bytes.byteLength > 5 * 1024 * 1024
  )
    throw new Error('INVALID_SERVER_IMAGE_UPLOAD')
}
export function parseServerImageUpload(value: unknown): { imageUrl: string } {
  const url = (value as { imageUrl?: unknown } | null)?.imageUrl
  if (typeof url !== 'string' || url.length > 2048) throw new Error('INVALID_SERVER_IMAGE_UPLOAD')
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error('INVALID_SERVER_IMAGE_UPLOAD')
  return { imageUrl: url }
}
function parseCommunityServers(input: unknown): PartnerServer[] {
  if (!Array.isArray(input) || input.length > 16) throw new Error('INVALID_COMMUNITY_SERVERS')
  const ids = new Set<string>()
  const endpoints = new Set<string>()
  return input.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('INVALID_COMMUNITY_SERVER')
    const server = entry as Record<string, unknown>
    const host = server.host
    const port = server.port
    const validHost =
      typeof host === 'string' &&
      host.length <= 253 &&
      (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
        ? host.split('.').every((part) => Number(part) <= 255) &&
          !host.startsWith('0.') &&
          !host.startsWith('127.')
        : host.includes('.') &&
          host.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)))
    if (
      !uuid(server.id) ||
      ids.has(server.id) ||
      typeof server.name !== 'string' ||
      !server.name.trim() ||
      server.name.length > 64 ||
      Array.from(server.name).some((char) => char.charCodeAt(0) < 32) ||
      !validHost ||
      !Number.isInteger(port) ||
      (port as number) < 1 ||
      (port as number) > 65535 ||
      (server.countryCode != null && !country(server.countryCode)) ||
      (server.category !== undefined &&
        !SERVER_CATEGORIES.includes(server.category as ServerCategory)) ||
      (server.gameVersion !== undefined &&
        server.gameVersion !== 'cs16' &&
        server.gameVersion !== 'cs13') ||
      (server.imageUrl !== undefined &&
        server.imageUrl !== null &&
        (typeof server.imageUrl !== 'string' || server.imageUrl.length > 2048))
    )
      throw new Error('INVALID_COMMUNITY_SERVER')
    const endpoint = `${(host as string).toLowerCase()}:${port}`
    if (server.imageUrl != null) {
      const image = new URL(server.imageUrl as string)
      if (!['http:', 'https:'].includes(image.protocol) || image.username || image.password)
        throw new Error('INVALID_COMMUNITY_SERVER_IMAGE')
    }
    if (endpoints.has(endpoint)) throw new Error('DUPLICATE_COMMUNITY_SERVER')
    ids.add(server.id)
    endpoints.add(endpoint)
    return {
      id: server.id,
      name: server.name,
      host,
      port,
      ...(server.countryCode !== undefined ? { countryCode: server.countryCode } : {}),
      ...(server.category !== undefined ? { category: server.category } : {}),
      gameVersion: server.gameVersion ?? 'cs16',
      imageUrl: (server.imageUrl ?? null) as string | null
    } as PartnerServer
  })
}
export function parseCommunityOwnerSettings(input: unknown): CommunityUpdate {
  if (!input || typeof input !== 'object') throw new Error('INVALID_COMMUNITY_SETTINGS')
  const branding = (input as { branding?: unknown }).branding
  if (!branding || typeof branding !== 'object') throw new Error('INVALID_COMMUNITY_SETTINGS')
  const value = branding as Record<string, unknown>
  if (typeof value.description !== 'string') throw new Error('INVALID_COMMUNITY_SETTINGS')
  if (
    typeof value.communityName !== 'string' ||
    !value.communityName.trim() ||
    [...value.communityName].length > 32
  )
    throw new Error('INVALID_COMMUNITY_SETTINGS')
  const output = {
    name: value.communityName,
    communityCountryCode: value.communityCountryCode ?? null,
    description: value.description,
    servers: parseCommunityServers(value.servers)
  }
  validateCommunityUpdate(output)
  return output
}
export function validateCommunityUpdate(input: unknown): asserts input is CommunityUpdate {
  if (!input || typeof input !== 'object') throw new Error('INVALID_COMMUNITY_UPDATE')
  const value = input as Record<string, unknown>
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    [...value.name].length > 32 ||
    Array.from(value.name).some((char) => char.charCodeAt(0) < 32) ||
    (value.communityCountryCode !== null && !country(value.communityCountryCode)) ||
    typeof value.description !== 'string' ||
    value.description.length > 1000 ||
    Array.from(value.description).some((char) => {
      const code = char.charCodeAt(0)
      return code < 32 && code !== 9 && code !== 10 && code !== 13
    }) ||
    !Array.isArray(value.servers)
  )
    throw new Error('INVALID_COMMUNITY_UPDATE')
  parseCommunityServers(value.servers)
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
const country = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v)
export function communityDirectoryPath(input: unknown): string {
  if (!input || typeof input !== 'object') throw new Error('INVALID_DIRECTORY_QUERY')
  const q = input as CommunityDirectoryQuery
  if (
    (q.cursor !== null &&
      (typeof q.cursor !== 'string' ||
        q.cursor.length > 1024 ||
        !/^[A-Za-z0-9_-]+$/.test(q.cursor))) ||
    typeof q.search !== 'string' ||
    q.search.length > 100 ||
    (q.category !== '' && !SERVER_CATEGORIES.includes(q.category)) ||
    (q.country !== '' && !country(q.country))
  )
    throw new Error('INVALID_DIRECTORY_QUERY')
  const params = new URLSearchParams({ search: q.search })
  if (q.cursor) params.set('cursor', q.cursor)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (timeZone) params.set('timeZone', timeZone)
  if (q.category) params.set('category', q.category)
  if (q.country) params.set('country', q.country)
  return `/partners/communities?${params}`
}
export function validateCommunityJoin(id: unknown, expected: unknown): asserts id is string {
  if (!uuid(id) || (expected !== null && !uuid(expected))) throw new Error('INVALID_COMMUNITY_JOIN')
}
export function parseCommunityJoin(value: unknown): { joined: true; communityId: string } {
  const v = value as Record<string, unknown> | null
  if (!v || v.joined !== true || !uuid(v.communityId)) throw new Error('INVALID_COMMUNITY_JOIN')
  return { joined: true, communityId: v.communityId }
}
export function parseCommunityLeave(value: unknown): { left: true } {
  if (!value || typeof value !== 'object' || (value as { left?: unknown }).left !== true)
    throw new Error('INVALID_COMMUNITY_LEAVE')
  return { left: true }
}
export function parseCommunityDirectory(value: unknown): CommunityDirectoryResult {
  const v = value as Record<string, unknown> | null
  if (
    !v ||
    !Array.isArray(v.communities) ||
    v.communities.length > 24 ||
    (v.nextCursor != null &&
      (typeof v.nextCursor !== 'string' ||
        v.nextCursor.length > 1024 ||
        !/^[A-Za-z0-9_-]+$/.test(v.nextCursor))) ||
    (v.currentCommunityId !== null && !uuid(v.currentCommunityId)) ||
    (v.canBypassLeaveRestriction !== undefined &&
      typeof v.canBypassLeaveRestriction !== 'boolean') ||
    (v.viewerCountryCode !== null && !country(v.viewerCountryCode))
  )
    throw new Error('INVALID_COMMUNITY_DIRECTORY')
  const communities = v.communities.map((entry: unknown): CommunityCard => {
    if (!entry || typeof entry !== 'object') throw new Error('INVALID_COMMUNITY_CARD')
    const row = entry as CommunityCard
    if (
      !uuid(row.id) ||
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      row.name.length > 64 ||
      typeof row.description !== 'string' ||
      row.description.length > 1000 ||
      !Array.isArray(row.categories) ||
      row.categories.length > 10 ||
      row.categories.some((c) => !SERVER_CATEGORIES.includes(c)) ||
      !Array.isArray(row.countries) ||
      row.countries.length > 16 ||
      row.countries.some((c) => !country(c)) ||
      !Number.isInteger(row.serverCount) ||
      row.serverCount < 0 ||
      row.serverCount > 16 ||
      (row.memberCount !== undefined &&
        row.memberCount !== null &&
        (!Number.isInteger(row.memberCount) || row.memberCount < 0)) ||
      (row.canLeave !== undefined && typeof row.canLeave !== 'boolean')
    )
      throw new Error('INVALID_COMMUNITY_CARD')
    if (row.imageUrl !== null) {
      if (typeof row.imageUrl !== 'string' || row.imageUrl.length > 2048)
        throw new Error('INVALID_COMMUNITY_IMAGE')
      const url = new URL(row.imageUrl)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
        throw new Error('INVALID_COMMUNITY_IMAGE')
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      categories: row.categories,
      countries: row.countries,
      serverCount: row.serverCount,
      memberCount: row.memberCount ?? null,
      canLeave: row.canLeave ?? true
    }
  })
  if (new Set(communities.map((row) => row.id)).size !== communities.length)
    throw new Error('DUPLICATE_COMMUNITY')
  const currentCommunity =
    v.currentCommunity === null
      ? null
      : parseCommunityDirectory({
          ...v,
          currentCommunity: null,
          currentCommunityId: null,
          communities: [v.currentCommunity]
        }).communities[0]
  if ((currentCommunity?.id ?? null) !== v.currentCommunityId)
    throw new Error('INVALID_CURRENT_COMMUNITY')
  return {
    currentCommunity,
    communities,
    nextCursor: (v.nextCursor ?? null) as string | null,
    currentCommunityId: v.currentCommunityId as string | null,
    canBypassLeaveRestriction: v.canBypassLeaveRestriction === true,
    viewerCountryCode: v.viewerCountryCode as string | null
  }
}
