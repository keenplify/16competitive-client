import { useEffect, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { readableNewsContent } from './news.api'
import { useNewsStore } from './news.store'
import { useOperationStore } from '../operations/operation.store'
import { useNavigationStore } from '../navigation/navigation.store'

interface LobbyNewsPanelProps {
  className?: string
}

export function LobbyNewsPanel({ className }: LobbyNewsPanelProps): JSX.Element {
  const posts = useNewsStore((state) => state.previewPosts)
  const status = useNewsStore((state) => state.previewStatus)
  const loadPreview = useNewsStore((state) => state.loadPreview)
  const operation = useOperationStore((state) => state.activeOperation)
  const loadOperation = useOperationStore((state) => state.loadActive)
  const navigate = useNavigationStore((state) => state.navigate)
  const setProfileTab = useNavigationStore((state) => state.setProfileTab)

  useEffect(() => {
    void Promise.all([loadPreview(), loadOperation()])
  }, [loadOperation, loadPreview])

  const openOperation = (): void => {
    setProfileTab('operation')
    navigate('profile')
  }

  return (
    <aside className={twMerge('hidden w-64 shrink-0 overflow-y-auto p-4 md:block', className)}>
      <div className="space-y-2">
        {operation && (
          <button
            type="button"
            onClick={openOperation}
            className="group relative block w-full overflow-hidden border border-amber-300/25 bg-neutral-950/85 text-left shadow-xl transition hover:-translate-y-0.5 hover:border-amber-300/60 hover:shadow-[0_12px_30px_rgba(245,158,11,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            {operation.heroUrl && (
              <img
                src={operation.heroUrl}
                alt=""
                loading="lazy"
                className="aspect-video w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
            )}
            <span className="absolute inset-0 bg-linear-to-t from-black via-black/30 to-transparent" />
            <span className="absolute top-2 left-2 rounded bg-amber-300 px-2 py-1 text-[9px] font-black tracking-[0.14em] text-black uppercase">
              Active Operation
            </span>
            <span className="absolute inset-x-0 bottom-0 p-3">
              <span className="block text-[10px] font-bold tracking-[0.16em] text-amber-200 uppercase">
                View Operation
              </span>
              <strong className="mt-1 line-clamp-2 block text-sm leading-5 text-white">
                {operation.title}
              </strong>
            </span>
          </button>
        )}
        {status === 'loading' && <p className="text-xs text-neutral-400">Loading news…</p>}
        {status === 'error' && <p className="text-xs text-neutral-500">News is unavailable.</p>}
        {status === 'ready' && posts.length === 0 && (
          <p className="text-xs text-neutral-500">No news posts yet.</p>
        )}
        {posts.slice(0, operation ? 1 : 2).map((post) => {
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
