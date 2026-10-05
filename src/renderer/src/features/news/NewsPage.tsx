import { useEffect, type JSX } from 'react'
import { ExternalLink } from 'lucide-react'
import { communityLinks, desktopAppUrl } from '../community/links'
import { isWebRuntime } from '../../web-runtime'
import { readableNewsContent } from './news.api'
import { useNewsStore } from './news.store'

export function NewsPage(): JSX.Element {
  const newsLinks = isWebRuntime()
    ? [...communityLinks, { label: 'Get desktop app', href: desktopAppUrl }]
    : communityLinks
  const posts = useNewsStore((state) => state.allPosts)
  const status = useNewsStore((state) => state.allStatus)
  const loadAll = useNewsStore((state) => state.loadAll)

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  return (
    <main className="min-h-[calc(100vh-4rem)] w-full p-5 text-white sm:min-h-[calc(100vh-5rem)] sm:p-10">
      <header className="mx-auto max-w-6xl border-b border-white/10 pb-6 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
        <p className="text-xs font-bold tracking-[.2em] text-sky-400 uppercase">Community</p>
        <h1 className="mt-2 text-3xl font-semibold">News</h1>
        <p className="mt-2 text-sm text-neutral-200">Updates from 1.6 Competitive</p>
      </header>
      <nav className="mx-auto mt-8 max-w-6xl" aria-label="Community links">
        <h2 className="text-sm font-semibold text-white">Follow &amp; support</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {newsLinks.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 border border-white/15 bg-neutral-900/90 px-3 text-sm text-neutral-200 transition hover:border-sky-400/40 hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              {label}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ))}
        </div>
      </nav>
      {status === 'loading' && posts.length === 0 && (
        <p className="py-16 text-center text-sm text-neutral-400">Loading news…</p>
      )}
      {status === 'refreshing' && (
        <p className="mt-4 text-center text-xs text-neutral-500">Loading more news…</p>
      )}
      {status === 'error' && (
        <p className="py-16 text-center text-sm text-rose-300">Could not load news right now.</p>
      )}
      {status === 'ready' && posts.length === 0 && (
        <p className="py-16 text-center text-sm text-neutral-400">No news posts yet.</p>
      )}
      <div className="mx-auto mt-8 max-w-6xl columns-1 gap-4 sm:columns-2 xl:columns-3">
        {posts.map((post) => (
          <article
            key={post.id}
            className="mb-4 break-inside-avoid overflow-hidden border border-white/10 bg-neutral-900/90"
          >
            {post.mediaUrl && (
              <img
                src={post.mediaUrl}
                alt=""
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            )}
            <div className="p-5">
              {(() => {
                const paragraphs = readableNewsContent(post.content)
                  .split('\n')
                  .map((paragraph) => paragraph.trim())
                  .filter(Boolean)
                const title = paragraphs[0] ?? '1.6 Competitive update'
                const body = paragraphs.slice(1).join('\n')
                return (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
                      <time className="shrink-0 text-xs text-neutral-500" dateTime={post.createdAt}>
                        {new Date(post.createdAt).toLocaleDateString()}
                      </time>
                    </div>
                    {body && (
                      <p className="mt-4 break-words whitespace-pre-wrap text-sm leading-6 text-neutral-200">
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
          </article>
        ))}
      </div>
    </main>
  )
}
