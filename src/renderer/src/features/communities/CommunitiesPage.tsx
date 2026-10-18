import { PartnerServersPanel } from '../partner-branding/PartnerServersPanel'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useEffect, type JSX } from 'react'
import { Users, LoaderCircle, Search } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { COUNTRY_OPTIONS, CountryFlag } from '../../components/CountryFlag'
import {
  SERVER_CATEGORIES,
  type ServerCategory,
  type CommunityCard
} from '../../../../shared/community-directory'
import { useCommunitiesStore } from './communities.store'
import { useTranslation } from '../i18n/i18n'

export function CommunitiesPage(): JSX.Element {
  const { t, language } = useTranslation()
  const state = useCommunitiesStore()
  const { query, load } = state
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [query, load])
  return (
    <section data-i18n-skip className="mx-auto w-full max-w-6xl p-5 pb-16 text-white sm:p-8">
      <h1 className="text-3xl font-semibold">{t('directory.title')}</h1>
      <p className="mt-2 text-sm text-neutral-400">{t('directory.description')}</p>
      {state.currentCommunity && (
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
              <h2 id="your-community-title" className="mt-2 text-2xl font-semibold">
                {state.currentCommunity.name}
              </h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-300">
                {state.currentCommunity.description || t('directory.noDescription')}
              </p>
            </div>
            <Button
              variant="secondary"
              className="text-rose-300"
              disabled={state.joining || state.loading}
              onClick={() => state.requestLeave(true)}
            >
              {t('directory.leave')}
            </Button>
          </div>
          <h3 className="mt-6 text-lg font-semibold">{t('directory.servers')}</h3>
          <PartnerServersPanel
            key={state.currentCommunity.id}
            disabled={state.joining}
            className="pb-0"
          />
        </section>
      )}
      <h2 className="mt-8 text-xl font-semibold">{t('directory.discover')}</h2>
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
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('directory.filter')}>
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
        className="mt-4 flex min-h-12 items-center gap-2 text-xs text-neutral-400"
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
        ) : (
          <>
            {state.viewerCountryCode && (
              <CountryFlag code={state.viewerCountryCode} className="h-4 w-6 object-cover" />
            )}
            {t('directory.order')}
          </>
        )}
      </div>
      <div
        className="grid min-h-80 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-busy={state.loading}
      >
        {state.loading && state.communities.length === 0
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-96 animate-pulse border border-white/10 bg-white/5" />
            ))
          : state.communities.map((community) => (
              <CommunityTile
                key={community.id}
                community={community}
                current={community.id === state.currentCommunityId}
                disabled={state.loading || state.joining || state.error}
                onSelect={() => state.select(community)}
              />
            ))}
        {!state.loading && !state.error && state.communities.length === 0 && (
          <p className="col-span-full py-20 text-center text-sm text-neutral-400">
            {t('directory.empty')}
          </p>
        )}
      </div>
      <div className="mt-5 flex h-11 items-center justify-center gap-4">
        <Button
          variant="secondary"
          disabled={query.page === 1 || state.loading || state.joining}
          onClick={() => state.updateQuery({ page: query.page - 1 })}
        >
          {t('directory.previous')}
        </Button>
        <span className="text-sm tabular-nums">{query.page}</span>
        <Button
          variant="secondary"
          disabled={!state.hasMore || state.loading || state.joining}
          onClick={() => state.updateQuery({ page: query.page + 1 })}
        >
          {t('directory.next')}
        </Button>
      </div>
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
  disabled,
  onSelect
}: {
  community: CommunityCard
  current: boolean
  disabled: boolean
  onSelect: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <article className="flex min-h-96 flex-col overflow-hidden border border-white/10 bg-neutral-950/85">
      <div className="relative grid aspect-video shrink-0 place-items-center bg-white/5">
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
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h2 className="truncate text-lg font-semibold" title={community.name}>
          {community.name}
        </h2>
        <div className="flex min-h-4 flex-wrap gap-2">
          {community.countries.map((code) => (
            <CountryFlag key={code} code={code} className="h-4 w-6 object-cover" />
          ))}
        </div>
        <p
          title={community.description}
          className="line-clamp-3 min-h-15 whitespace-pre-wrap break-words text-sm text-neutral-400"
        >
          {community.description || t('directory.noDescription')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {community.categories.map((category: ServerCategory) => (
            <span key={category} className="border border-white/15 px-2 py-1 text-xs text-sky-200">
              {t(`directory.category.${category}`)}
            </span>
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          {t('directory.serverCount', { count: String(community.serverCount) })}
        </p>
        <Button
          className="mt-auto w-full"
          variant={current ? 'secondary' : 'primary'}
          disabled={current || disabled}
          onClick={onSelect}
        >
          {t(current ? 'directory.joined' : 'directory.join')}
        </Button>
      </div>
    </article>
  )
}
