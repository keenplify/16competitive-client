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
  leave: 'communities:leave'
} as const
export interface CommunityCard {
  id: string
  name: string
  description: string
  imageUrl: string | null
  categories: ServerCategory[]
  countries: string[]
  serverCount: number
}
export interface CommunityDirectoryQuery {
  page: number
  search: string
  category: ServerCategory | ''
  country: string
}
export interface CommunityDirectoryResult {
  currentCommunity: CommunityCard | null
  communities: CommunityCard[]
  currentCommunityId: string | null
  viewerCountryCode: string | null
  hasMore: boolean
}
export interface CommunityDirectoryApi {
  list(query: CommunityDirectoryQuery): Promise<CommunityDirectoryResult>
  leave(expectedCommunityId: string): Promise<{ left: true }>
  join(
    id: string,
    expectedCommunityId: string | null
  ): Promise<{ joined: true; communityId: string }>
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
const country = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v)
export function communityDirectoryPath(input: unknown): string {
  if (!input || typeof input !== 'object') throw new Error('INVALID_DIRECTORY_QUERY')
  const q = input as CommunityDirectoryQuery
  if (
    !Number.isInteger(q.page) ||
    q.page < 1 ||
    q.page > 10000 ||
    typeof q.search !== 'string' ||
    q.search.length > 100 ||
    (q.category !== '' && !SERVER_CATEGORIES.includes(q.category)) ||
    (q.country !== '' && !country(q.country))
  )
    throw new Error('INVALID_DIRECTORY_QUERY')
  const params = new URLSearchParams({ page: String(q.page), search: q.search })
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
    typeof v.hasMore !== 'boolean' ||
    (v.currentCommunityId !== null && !uuid(v.currentCommunityId)) ||
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
      row.serverCount > 16
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
      serverCount: row.serverCount
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
    hasMore: v.hasMore,
    currentCommunityId: v.currentCommunityId as string | null,
    viewerCountryCode: v.viewerCountryCode as string | null
  }
}
