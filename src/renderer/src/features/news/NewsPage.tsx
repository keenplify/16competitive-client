import { useEffect, useState, type JSX } from 'react'

const STATUSES_URL = 'https://mastodon.social/api/v1/accounts/117184181054588299/statuses?limit=20'

interface NewsStatus {
  id: string
  createdAt: string
  url: string
  content: string
  mediaUrl: string | null
}

const parseStatus = (value: unknown): NewsStatus | null => {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== 'string' ||
    typeof item.created_at !== 'string' ||
    typeof item.content !== 'string'
  )
    return null
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

const readableContent = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  // Mastodon uses <p> and <br> for formatting. Preserve those breaks before
  // extracting text so announcements remain readable in the card.
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

export function NewsPage(): JSX.Element {
  const [posts, setPosts] = useState<NewsStatus[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(STATUSES_URL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`News request failed (${response.status})`)
        const body: unknown = await response.json()
        if (!Array.isArray(body)) throw new Error('Invalid news response')
        return body.map(parseStatus).filter((post): post is NewsStatus => post !== null)
      })
      .then((nextPosts) => {
        setPosts(nextPosts)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('[News] failed to load Mastodon statuses', error)
        setState('error')
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="min-h-[calc(100vh-4rem)] w-full bg-neutral-950/75 p-5 text-white sm:min-h-[calc(100vh-5rem)] sm:p-10">
      <header className="mx-auto max-w-5xl border-b border-white/10 pb-6">
        <p className="text-xs font-bold tracking-[.2em] text-sky-400 uppercase">Community</p>
        <h1 className="mt-2 text-3xl font-semibold">News</h1>
        <p className="mt-2 text-sm text-neutral-400">Updates from 1.6 Competitive</p>
      </header>
      {state === 'loading' && (
        <p className="py-16 text-center text-sm text-neutral-400">Loading news…</p>
      )}
      {state === 'error' && (
        <p className="py-16 text-center text-sm text-rose-300">Could not load news right now.</p>
      )}
      {state === 'ready' && posts.length === 0 && (
        <p className="py-16 text-center text-sm text-neutral-400">No news posts yet.</p>
      )}
      <div className="mx-auto mt-8 max-w-5xl space-y-4">
        {posts.map((post) => (
          <article
            key={post.id}
            className="overflow-hidden border border-white/10 bg-neutral-900/90"
          >
            <div className="p-5">
              {(() => {
                const paragraphs = readableContent(post.content)
                  .split('\n')
                  .map((paragraph) => paragraph.trim())
                  .filter(Boolean)
                const title = paragraphs[0] ?? '1.6 Competitive update'
                const body = paragraphs.slice(1).join('\n')
                return (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-lg font-semibold">{title}</h2>
                      <time className="text-xs text-neutral-500" dateTime={post.createdAt}>
                        {new Date(post.createdAt).toLocaleDateString()}
                      </time>
                    </div>
                    {body && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-200">
                        {body}
                      </p>
                    )}
                  </>
                )
              })()}
              <a
                className="mt-4 inline-block text-xs font-semibold text-sky-400 hover:text-sky-300"
                href={post.url}
                target="_blank"
                rel="noreferrer"
              >
                View on Mastodon ↗
              </a>
            </div>
            {post.mediaUrl && (
              <img
                src={post.mediaUrl}
                alt=""
                loading="lazy"
                className="max-h-[28rem] w-full object-cover"
              />
            )}
          </article>
        ))}
      </div>
    </main>
  )
}
