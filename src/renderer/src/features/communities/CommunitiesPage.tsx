import { PartnerServersPanel } from '../partner-branding/PartnerServersPanel'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useEffect, useId, useRef, type JSX } from 'react'
import { Globe2, LoaderCircle, Pencil, Search, Users } from 'lucide-react'
import type { IconType } from 'react-icons'
import { SiDiscord, SiFacebook, SiInstagram, SiKofi, SiMastodon, SiYoutube } from 'react-icons/si'
import { Button } from '../../components/ui/Button'
import { COUNTRY_OPTIONS, CountryFlag } from '../../components/CountryFlag'
import {
  SERVER_CATEGORIES,
  type ServerCategory,
  type CommunityCard
} from '../../../../shared/community-directory'
import { useCommunitiesStore } from './communities.store'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { CommunityEditPage } from './CommunityEditPage'
import { useCommunityMembersStore } from '../partner-branding/community-members.store'
import { useCommunityLinks } from '../community/links'

const communitySocialIcons: Record<string, IconType> = {
  Discord: SiDiscord,
  Mastodon: SiMastodon,
  'Ko-fi': SiKofi,
  Facebook: SiFacebook,
  Instagram: SiInstagram,
  YouTube: SiYoutube
}

function communityLinkIcon(label: string): JSX.Element {
  const Icon = communitySocialIcons[label]
  return Icon ? (
    <Icon className="size-4" aria-hidden="true" />
  ) : (
    <Globe2 className="size-4" aria-hidden="true" />
  )
}

function previewDescription(description: string): string {
  const characters = Array.from(description.trim())
  return characters.length > 128 ? `${characters.slice(0, 128).join('').trimEnd()}...` : description
}

export function CommunitiesPage({ friendsCollapsed }: { friendsCollapsed: boolean }): JSX.Element {
  const { t, language } = useTranslation()
  const state = useCommunitiesStore()
  const playerId = useAuthStore((store) => store.session?.player.id)
  const members = useCommunityMembersStore()
  const communityLinks = useCommunityLinks()
  const memberTooltipId = useId()
  const loadMoreTrigger = useRef<HTMLDivElement>(null)
  const isOwner = Boolean(state.currentCommunity && state.currentCommunity.id === playerId)
  const discovering = state.view === 'discover' || !state.currentCommunity
  const currentMemberCount =
    members.communityId === state.currentCommunityId && !members.error && members.page > 0
      ? members.total + 1
      : null
  const displayedMemberCount = state.currentCommunity?.memberCount ?? currentMemberCount ?? '—'
  const memberCountLabel = t('directory.memberCount', { count: String(displayedMemberCount) })
  const { query, load } = state
  const { nextCursor, loading, loadingMore, error, loadMoreError, loadMore } = state
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [query, load])
  useEffect(() => {
    const trigger = loadMoreTrigger.current
    if (!discovering || !trigger || !nextCursor || loading || loadingMore || error || loadMoreError)
      return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore()
      },
      { rootMargin: '500px' }
    )
    observer.observe(trigger)
    return () => observer.disconnect()
  }, [discovering, nextCursor, loading, loadingMore, error, loadMoreError, loadMore])
  if (state.editing && state.editTarget?.id === playerId)
    return <CommunityEditPage friendsCollapsed={friendsCollapsed} />
  return (
    <section
      data-i18n-skip
      className="community-readable-text mx-auto w-full max-w-6xl p-5 pb-16 text-white sm:p-8"
    >
      <header className={discovering ? 'border-b border-white/15 pb-6' : ''}>
        {discovering && (
          <p className="text-xs font-bold uppercase tracking-[.2em] text-sky-300">
            {t('directory.title')}
          </p>
        )}
        <h1 className={discovering ? 'mt-2 text-3xl font-semibold' : 'text-3xl font-semibold'}>
          {t(discovering ? 'directory.discover' : 'directory.title')}
        </h1>
        {discovering && (
          <p className="mt-2 text-sm text-neutral-200">{t('directory.description')}</p>
        )}
      </header>
      {!discovering && state.currentCommunity && (
        <section
          className="mt-6 border border-sky-300/20 bg-neutral-950/75 p-5"
          aria-labelledby="your-community-title"
        >
          <div className="flex flex-wrap items-start gap-5">
            {state.currentCommunity.imageUrl && (
              <img
                src={state.currentCommunity.imageUrl}
                alt=""
                className="aspect-video w-64 max-w-full object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest text-sky-300">
                {t('directory.yourCommunity')}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <h2 id="your-community-title" className="text-2xl font-semibold">
                  {state.currentCommunity.name}
                </h2>
                {isOwner && (
                  <Button
                    variant="ghost"
                    className="size-8 p-0"
                    aria-label={t('directory.editName')}
                    onClick={() => void state.startEdit(state.currentCommunity!)}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <div className="mt-3 flex items-start gap-2">
                <p className="whitespace-pre-wrap break-words text-sm text-neutral-300">
                  {state.currentCommunity.description || t('directory.noDescription')}
                </p>
                {isOwner && (
                  <Button
                    variant="ghost"
                    className="size-8 shrink-0 p-0"
                    aria-label={t('directory.editDescriptionAction')}
                    onClick={() => void state.startEdit(state.currentCommunity!)}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {communityLinks.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="inline-flex size-9 items-center justify-center border border-white/15 bg-white/5 text-neutral-200 transition hover:border-sky-300 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                  >
                    {communityLinkIcon(label)}
                  </a>
                ))}
              </div>
              <span
                tabIndex={0}
                aria-label={memberCountLabel}
                className="group relative inline-flex h-9 items-center gap-1.5 px-2 text-sm text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              >
                <Users className="size-4" aria-hidden="true" />
                <span aria-hidden="true">{displayedMemberCount}</span>
                <span
                  id={memberTooltipId}
                  role="tooltip"
                  className="pointer-events-none absolute top-full right-0 z-10 mt-2 whitespace-nowrap border border-white/20 bg-neutral-950 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  {memberCountLabel}
                </span>
              </span>
              <Button
                variant="secondary"
                className="text-rose-300"
                disabled={state.joining || state.loading}
                onClick={() => state.requestLeave(true)}
              >
                {t('directory.leave')}
              </Button>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2">
            <h3 className="text-lg font-semibold">{t('directory.servers')}</h3>
            {isOwner && (
              <Button
                variant="ghost"
                className="size-8 p-0"
                aria-label={t('directory.editServers')}
                onClick={() => void state.startEdit(state.currentCommunity!)}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <PartnerServersPanel
            key={state.currentCommunity.id}
            disabled={state.joining}
            className="pb-0"
          />
        </section>
      )}
      {!discovering && (
        <Button variant="secondary" className="mt-6" onClick={() => state.setView('discover')}>
          {t('directory.discover')}
        </Button>
      )}
      {discovering && (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 text-xs text-neutral-300">
              {t('directory.search')}
              <span className="mt-2 flex h-11 items-center gap-2 border border-white/15 bg-neutral-950/80 px-3">
                <Search className="size-4 shrink-0" aria-hidden="true" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  value={query.search}
                  maxLength={100}
                  disabled={state.joining}
                  onChange={(e) => state.updateQuery({ search: e.target.value })}
                />
              </span>
            </label>
            <label className="text-xs text-neutral-300">
              {t('directory.country')}
              <select
                className="mt-2 block h-11 max-w-64 border border-white/15 bg-neutral-950 px-3 text-sm"
                value={query.country}
                disabled={state.joining}
                onChange={(e) => state.updateQuery({ country: e.target.value })}
              >
                <option value="">{t('directory.automatic')}</option>
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country.code} value={country.code}>
                    {new Intl.DisplayNames([language === 'tl' ? 'fil' : language], {
                      type: 'region'
                    }).of(country.code) ?? country.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="group"
            aria-label={t('directory.filter')}
          >
            {(['', ...SERVER_CATEGORIES] as const).map((category) => (
              <Button
                key={category}
                variant={query.category === category ? 'primary' : 'secondary'}
                className="h-9 px-3 text-xs"
                aria-pressed={query.category === category}
                disabled={state.joining}
                onClick={() => state.updateQuery({ category })}
              >
                {category ? t(`directory.category.${category}`) : t('directory.all')}
              </Button>
            ))}
          </div>
          <div
            className="mt-4 flex min-h-12 items-center gap-2 text-xs text-neutral-200"
            role="status"
            aria-live="polite"
          >
            {state.loading ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {t('directory.loading')}
              </>
            ) : state.error ? (
              <>
                {t('directory.error')}
                <Button variant="ghost" onClick={() => void load()}>
                  {t('community.retry')}
                </Button>
              </>
            ) : null}
          </div>
          <div
            className="min-h-80 columns-1 gap-4 sm:columns-2 xl:columns-3"
            aria-busy={state.loading}
          >
            {state.loading && state.communities.length === 0
              ? Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="mb-4 h-96 animate-pulse break-inside-avoid border border-white/10 bg-white/5"
                  />
                ))
              : state.communities.map((community) => (
                  <CommunityTile
                    key={community.id}
                    community={
                      community.id === state.currentCommunityId && community.memberCount === null
                        ? { ...community, memberCount: currentMemberCount }
                        : community
                    }
                    current={community.id === state.currentCommunityId}
                    owner={community.id === playerId}
                    disabled={state.loading || state.joining || state.error}
                    onSelect={() => state.select(community)}
                    onOpen={() => state.setView('home')}
                    onEdit={() => state.startEdit(community)}
                  />
                ))}
            {!state.loading && !state.error && state.communities.length === 0 && (
              <p className="py-20 text-center text-sm text-neutral-200">{t('directory.empty')}</p>
            )}
          </div>
          <div
            ref={loadMoreTrigger}
            className="mt-5 flex min-h-12 items-center justify-center"
            role="status"
            aria-live="polite"
          >
            {state.loadingMore && (
              <>
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                {t('directory.loadingMore')}
              </>
            )}
            {state.loadMoreError && (
              <Button variant="secondary" onClick={() => void state.loadMore()}>
                {t('community.retry')}
              </Button>
            )}
          </div>
        </>
      )}
      {state.leaveRequested && (
        <ModalDialog
          open
          onClose={() => state.requestLeave(false)}
          labelledBy="community-leave-title"
          className="m-auto w-[min(28rem,calc(100vw-2rem))] border border-white/20 bg-neutral-950 p-6 text-white backdrop:bg-black/80"
        >
          <h2 id="community-leave-title" className="text-xl font-semibold">
            {t('directory.leaveTitle')}
          </h2>
          <p className="mt-3 text-sm text-neutral-300">{t('directory.leaveDescription')}</p>
          <div className="mt-3 min-h-10 text-sm text-rose-300" role="status">
            {state.joinError ? t('directory.leaveError') : ''}
          </div>
          <div className="flex gap-3">
            <Button
              autoFocus
              variant="secondary"
              className="flex-1"
              disabled={state.joining}
              onClick={() => state.requestLeave(false)}
            >
              {t('community.no')}
            </Button>
            <Button
              className="flex-1 gap-2"
              disabled={state.joining || state.loading || state.error}
              onClick={() => void state.leave()}
            >
              <span className="size-4">
                {state.joining && <LoaderCircle className="size-4 animate-spin" />}
              </span>
              {t('directory.leave')}
            </Button>
          </div>
        </ModalDialog>
      )}
      {state.selected && (
        <ModalDialog
          open
          onClose={() => state.select(null)}
          labelledBy="community-join-title"
          className="m-auto w-[min(28rem,calc(100vw-2rem))] border border-white/20 bg-neutral-950 p-6 text-white backdrop:bg-black/80"
        >
          <h2 id="community-join-title" className="text-xl font-semibold">
            {t('directory.joinTitle', { community: state.selected.name })}
          </h2>
          <p className="mt-3 text-sm text-neutral-300">{t('community.transferDescription')}</p>
          <p className="mt-2 text-sm text-neutral-400">{t('community.transferKeep')}</p>
          <div className="mt-3 min-h-10 text-sm text-rose-300" role="status">
            {state.joinError ? t('directory.joinError') : ''}
          </div>
          <div className="flex gap-3">
            <Button
              autoFocus
              variant="secondary"
              className="flex-1"
              disabled={state.joining}
              onClick={() => state.select(null)}
            >
              {t('community.no')}
            </Button>
            <Button
              className="flex-1 gap-2"
              disabled={state.joining || state.loading || state.error}
              onClick={() => void state.join()}
            >
              <span className="size-4">
                {state.joining && <LoaderCircle className="size-4 animate-spin" />}
              </span>
              {t('directory.join')}
            </Button>
          </div>
        </ModalDialog>
      )}
    </section>
  )
}

function CommunityTile({
  community,
  current,
  owner,
  disabled,
  onSelect,
  onOpen,
  onEdit
}: {
  community: CommunityCard
  current: boolean
  owner: boolean
  disabled: boolean
  onSelect: () => void
  onOpen: () => void
  onEdit: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <article className="mb-4 break-inside-avoid overflow-hidden border border-white/10 bg-neutral-900/90">
      <div className="relative grid aspect-square place-items-center bg-white/5">
        <Users className="absolute size-12 text-white/15" aria-hidden="true" />
        {community.imageUrl && (
          <img
            src={community.imageUrl}
            alt=""
            loading="lazy"
            className="relative h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold" title={community.name}>
          {current ? (
            <button
              type="button"
              className="text-left hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-sky-300"
              onClick={onOpen}
            >
              {community.name}
            </button>
          ) : (
            community.name
          )}
        </h2>
        <div className="flex min-h-4 flex-wrap gap-2">
          {community.countries.map((code) => (
            <CountryFlag key={code} code={code} className="h-4 w-6 object-cover" />
          ))}
        </div>
        <p
          title={community.description}
          className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200"
        >
          {community.description
            ? previewDescription(community.description)
            : t('directory.noDescription')}
        </p>
        <div className="flex min-h-8 flex-wrap gap-1.5">
          {community.categories.map((category: ServerCategory) => (
            <span
              key={category}
              className="rounded-full border border-white/25 bg-sky-300/10 px-3 py-1 text-xs text-sky-200"
            >
              {t(`directory.category.${category}`)}
            </span>
          ))}
          {community.categories.length === 0 && (
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-neutral-400">
              {t('directory.noCategory')}
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-400">
          {t('directory.memberCount', { count: String(community.memberCount ?? '—') })} ·{' '}
          {t('directory.serverCount', { count: String(community.serverCount) })}
        </p>
        {owner && (
          <Button className="mt-auto w-full gap-2" variant="secondary" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            {t('directory.edit')}
          </Button>
        )}
        <Button
          className={owner ? 'w-full' : 'mt-auto w-full'}
          variant={current ? 'secondary' : 'primary'}
          disabled={disabled}
          onClick={current ? onOpen : onSelect}
        >
          {t(current ? 'directory.joined' : 'directory.join')}
        </Button>
      </div>
    </article>
  )
}
