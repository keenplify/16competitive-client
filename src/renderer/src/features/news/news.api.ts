const STATUSES_URL = 'https://mastodon.social/api/v1/accounts/117184181054588299/statuses'

export interface NewsPost {
  id: string
  createdAt: string
  url: string
  content: string
  mediaUrl: string | null
}

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
    url: typeof item.url === 'string' ? item.url : 'https://mastodon.social/@16competitive',
    content: item.content,
    mediaUrl: mediaUrl?.startsWith('https://') ? mediaUrl : null
  }
}

const fetchAccountStatuses = async (
  limit: 3 | 4 | 20,
  signal: AbortSignal,
  pinned = false
): Promise<NewsPost[]> => {
  const query = new URLSearchParams({ limit: String(limit) })
  if (pinned) query.set('pinned', 'true')

  const response = await fetch(`${STATUSES_URL}?${query}`, { signal })
  if (!response.ok) throw new Error(`News request failed (${response.status})`)

  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('Invalid news response')
  return body.map(parseStatus).filter((post): post is NewsPost => post !== null)
}

export const fetchNewsPosts = (limit: 3 | 20, signal: AbortSignal): Promise<NewsPost[]> =>
  fetchAccountStatuses(limit, signal)

export const fetchLobbyNewsPosts = async (signal: AbortSignal): Promise<NewsPost[]> => {
  const [pinnedPosts, recentPosts] = await Promise.all([
    fetchAccountStatuses(4, signal, true),
    fetchAccountStatuses(4, signal)
  ])
  const pinnedIds = new Set(pinnedPosts.map(({ id }) => id))

  return [...pinnedPosts, ...recentPosts.filter(({ id }) => !pinnedIds.has(id))].slice(0, 4)
}

export const readableNewsContent = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.body.querySelectorAll('br').forEach((element) => element.replaceWith('\n'))
  document.body.querySelectorAll('p, li').forEach((element) => element.append('\n'))
  return (
    document.body.textContent
      ?.replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() ?? ''
  )
}
