import type { NewsPost } from '../shared/news'

const STATUSES_URL = 'https://mastodon.social/api/v1/accounts/117184181054588299/statuses'
const PROFILE_URL = 'https://mastodon.social/@16competitive'
const REQUEST_TIMEOUT_MS = 10_000

const parseStatus = (value: unknown): NewsPost | null => {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== 'string' ||
    typeof item.created_at !== 'string' ||
    typeof item.content !== 'string'
  ) {
    return null
  }

  const media = Array.isArray(item.media_attachments) ? item.media_attachments[0] : null
  const mediaUrl =
    typeof media === 'object' &&
    media !== null &&
    typeof (media as Record<string, unknown>).preview_url === 'string'
      ? (media as Record<string, string>).preview_url
      : null

  return {
    id: item.id,
    createdAt: item.created_at,
    url: typeof item.url === 'string' && item.url.startsWith('https://') ? item.url : PROFILE_URL,
    content: item.content,
    mediaUrl: mediaUrl?.startsWith('https://') ? mediaUrl : null
  }
}

const fetchAccountStatuses = async (limit: 4 | 20, pinned = false): Promise<NewsPost[]> => {
  const query = new URLSearchParams({ limit: String(limit) })
  if (pinned) query.set('pinned', 'true')

  const response = await fetch(`${STATUSES_URL}?${query}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`News request failed (${response.status})`)

  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('Invalid news response')
  return body.map(parseStatus).filter((post): post is NewsPost => post !== null)
}

export const getNewsPosts = (): Promise<NewsPost[]> => fetchAccountStatuses(20)

export const getLobbyNewsPosts = async (): Promise<NewsPost[]> => {
  const [pinnedPosts, recentPosts] = await Promise.all([
    fetchAccountStatuses(4, true),
    fetchAccountStatuses(4)
  ])
  const pinnedIds = new Set(pinnedPosts.map(({ id }) => id))
  return [...pinnedPosts, ...recentPosts.filter(({ id }) => !pinnedIds.has(id))].slice(0, 2)
}
