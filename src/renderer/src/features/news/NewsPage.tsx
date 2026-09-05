import { useEffect, type JSX } from 'react'
import { readableNewsContent } from './news.api'
import { useNewsStore } from './news.store'

export function NewsPage(): JSX.Element {
  const posts = useNewsStore((state) => state.allPosts)
  const status = useNewsStore((state) => state.allStatus)
  const loadAll = useNewsStore((state) => state.loadAll)

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  return (
    <main className="min-h-[calc(100vh-4rem)] w-full bg-neutral-950/75 p-5 text-white sm:min-h-[calc(100vh-5rem)] sm:p-10">
      <header className="mx-auto max-w-5xl border-b border-white/10 pb-6">
        <p className="text-xs font-bold tracking-[.2em] text-sky-400 uppercase">Community</p>
        <h1 className="mt-2 text-3xl font-semibold">News</h1>
        <p className="mt-2 text-sm text-neutral-400">Updates from 1.6 Competitive</p>
      </header>
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
      <div className="mx-auto mt-8 max-w-5xl space-y-4">
        {posts.map((post) => (
          <article
            key={post.id}
            className="overflow-hidden border border-white/10 bg-neutral-900/90"
          >
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
