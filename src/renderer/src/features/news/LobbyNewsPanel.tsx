import { useEffect, type JSX } from 'react'
import { readableNewsContent } from './news.api'
import { useNewsStore } from './news.store'

export function LobbyNewsPanel(): JSX.Element {
  const posts = useNewsStore((state) => state.posts)
  const status = useNewsStore((state) => state.status)
  const loadPreview = useNewsStore((state) => state.loadPreview)

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  return (
    <aside className="absolute top-0 right-0 bottom-0 z-10 hidden w-72 overflow-y-auto border-white/10 p-4 md:block">
      <div className="mt-3 space-y-2">
        {status === 'loading' && <p className="text-xs text-neutral-400">Loading news…</p>}
        {status === 'error' && <p className="text-xs text-neutral-500">News is unavailable.</p>}
        {status === 'ready' && posts.length === 0 && (
          <p className="text-xs text-neutral-500">No news posts yet.</p>
        )}
        {posts.slice(0, 3).map((post) => {
          const title = readableNewsContent(post.content).split('\n').find(Boolean)
          return (
            <a
              key={post.id}
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="block border border-white/10 bg-neutral-950/70 p-3 transition hover:border-sky-400/50 hover:bg-neutral-900/80"
            >
              {post.mediaUrl && (
                <img
                  src={post.mediaUrl}
                  alt=""
                  loading="lazy"
                  className="mb-3 aspect-video w-full object-cover"
                />
              )}
              <p className="line-clamp-2 text-xs font-semibold leading-5 text-white">
                {title ?? '1.6 Competitive update'}
              </p>
              <time className="mt-2 block text-[10px] text-neutral-500" dateTime={post.createdAt}>
                {new Date(post.createdAt).toLocaleDateString()}
              </time>
            </a>
          )
        })}
      </div>
    </aside>
  )
}
