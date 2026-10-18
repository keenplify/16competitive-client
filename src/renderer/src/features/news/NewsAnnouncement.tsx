import { ModalDialog } from '../../components/ui/ModalDialog'
import { useEffect, type JSX } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { NewsPost } from './news.api'
import { readableNewsContent } from './news.api'
import { useNewsAnnouncementStore } from './news-announcement.store'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'

const CHECK_INTERVAL_MS = 5 * 60_000

function NewsAnnouncementModal({
  post,
  onClose
}: {
  post: NewsPost
  onClose: () => void
}): JSX.Element {
  const { t, language } = useTranslation()
  const paragraphs = readableNewsContent(post.content).split('\n').filter(Boolean)

  return (
    <>
      <ModalDialog
        open
        onClose={onClose}
        className="m-auto max-h-[85vh] w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden border border-white/15 bg-neutral-900 p-0 text-white shadow-2xl backdrop:bg-neutral-950/85 open:flex"
        labelledBy="news-announcement-title"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
          <h2 id="news-announcement-title" className="text-xl font-semibold">
            {t('news.announcement.title')}
          </h2>
          <Button variant="ghost" className="shrink-0 text-neutral-200" onClick={onClose}>
            {t('news.announcement.close')}
          </Button>
        </header>
        <article className="min-h-0 overflow-y-auto">
          {post.mediaUrl && /^https:\/\//i.test(post.mediaUrl) && (
            <img
              src={post.mediaUrl}
              alt=""
              className="aspect-video w-full object-contain bg-neutral-950"
            />
          )}
          <div className="p-6" data-i18n-skip>
            <time dateTime={post.createdAt} className="text-xs text-neutral-400">
              {new Date(post.createdAt).toLocaleDateString(language)}
            </time>
            <h3 className="mt-3 text-xl font-semibold break-words">
              {paragraphs[0] ?? t('news.announcement.title')}
            </h3>
            {paragraphs.length > 1 && (
              <p className="mt-4 text-sm leading-6 break-words whitespace-pre-wrap text-neutral-200">
                {paragraphs.slice(1).join('\n\n')}
              </p>
            )}
          </div>
        </article>
        <footer className="shrink-0 border-t border-white/10 px-6 py-4">
          <a
            href={
              /^https:\/\//i.test(post.url) ? post.url : 'https://mastodon.social/@16competitive'
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-400 hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            {t('news.announcement.view')}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </footer>
      </ModalDialog>
    </>
  )
}

export function NewsAnnouncement(): JSX.Element | null {
  const playerId = useAuthStore((state) => state.session?.player.id ?? null)
  const accountId = useNewsAnnouncementStore((state) => state.playerId)
  const post = useNewsAnnouncementStore((state) => state.post)
  const setAccount = useNewsAnnouncementStore((state) => state.setAccount)
  const refresh = useNewsAnnouncementStore((state) => state.refresh)
  const dismiss = useNewsAnnouncementStore((state) => state.dismiss)

  useEffect(() => {
    setAccount(playerId)
    if (!playerId) return
    void refresh()
    const interval = window.setInterval(() => void refresh(), CHECK_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [playerId, setAccount, refresh])

  return playerId && playerId === accountId && post ? (
    <NewsAnnouncementModal key={`${playerId}:${post.id}`} post={post} onClose={dismiss} />
  ) : null
}
