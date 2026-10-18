import { ProfileLoadout } from './ProfileLoadout'
import { ProfileHistory } from './ProfileHistory'
import { useEffect, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useAuthStore } from '../auth/auth.store'
import { useProfileStore } from './profile.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useTranslation } from '../i18n/i18n'
import { CountryFlag } from '../../components/CountryFlag'
import { Button } from '../../components/ui/Button'
import { TabList } from '../../components/ui/TabList'
import { ProfileRankInsignia } from '../../components/ui/ProfileRankInsignia'
import { ProfileFlag } from './ProfileFlag'
import { ProfileOverview } from './ProfileOverview'
import { SkinsPage } from '../skins/SkinsPage'
import { MatchHistoryPage } from './MatchHistoryPage'
import { OperationPage } from '../operations/OperationPage'

export function ProfilePage({ playerId }: { playerId?: string }): JSX.Element {
  const accountId = useAuthStore((state) => state.session?.player.id)
  const id = playerId ?? accountId
  const own = id === accountId
  const entry = useProfileStore((state) => (id ? state.entries[id] : undefined))
  const load = useProfileStore((state) => state.load)
  const tab = useNavigationStore((state) => state.profileTab)
  const setTab = useNavigationStore((state) => state.setProfileTab)
  const { t, language } = useTranslation()
  const publicTab = useProfileStore((state) => state.tab)
  const setPublicTab = useProfileStore((state) => state.setTab)
  const visibleTab = playerId ? publicTab : tab
  useEffect(() => {
    if (id) void load(id)
  }, [id, load])
  const profile = entry?.profile
  return (
    <div className="w-full p-6 text-left text-white sm:p-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex min-h-32 flex-wrap items-center justify-between gap-6 border-b border-white/15 pb-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="size-16 shrink-0">
              {profile?.level !== undefined && (
                <ProfileRankInsignia
                  level={profile.level}
                  title={profile.levelTitle ?? ''}
                  ariaLabel={t('profile.levelValue', { level: profile.level })}
                  className="size-16"
                />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-semibold">
                {profile?.username ?? t('profile.title')}
              </h1>
              <div className="mt-2 flex min-h-9 items-center gap-3 text-sm text-neutral-300">
                {own ? (
                  <ProfileFlag />
                ) : (
                  <CountryFlag code={profile?.flagCountryCode} className="h-4 w-6 object-cover" />
                )}
                {profile && (
                  <span>
                    {t('profile.since', {
                      date: new Date(profile.createdAt).toLocaleDateString(language)
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <dl className="flex min-w-56 gap-10 tabular-nums">
            <div>
              <dt className="text-sm text-neutral-300">{t('profile.level')}</dt>
              <dd className="mt-1 text-3xl font-semibold">{profile?.level ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-300">MMR</dt>
              <dd className="mt-1 text-3xl font-semibold text-sky-300">
                {profile?.mmr.toLocaleString(language) ?? '—'}
              </dd>
            </div>
          </dl>
        </header>
        {
          <TabList
            className="mt-4"
            ariaLabel={t('profile.sections')}
            value={visibleTab}
            items={[
              { value: 'overview', label: t('profile.overview') },
              { value: 'skins', label: t('profile.loadout') },
              { value: 'matches', label: t('profile.history') },
              ...(own && !playerId
                ? [{ value: 'operation' as const, label: t('profile.operation') }]
                : [])
            ]}
            onChange={(next) => {
              if (playerId && next !== 'operation') setPublicTab(next)
              else setTab(next)
            }}
          />
        }
        {visibleTab === 'overview' || !own || Boolean(playerId) ? (
          <div className="min-h-[480px]">
            {entry?.status === 'error' ? (
              <div
                className="flex min-h-[480px] flex-col items-center justify-center gap-4"
                role="alert"
              >
                <p className="text-neutral-300">{t('profile.error')}</p>
                <Button
                  onClick={() => {
                    if (id) void load(id)
                  }}
                >
                  {t('profile.retry')}
                </Button>
              </div>
            ) : !profile ? (
              <div
                className="flex min-h-[480px] items-center justify-center gap-3 text-neutral-300"
                role="status"
              >
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                {t('profile.loading')}
              </div>
            ) : visibleTab === 'skins' ? (
              <ProfileLoadout profile={profile} />
            ) : visibleTab === 'matches' ? (
              <ProfileHistory profile={profile} />
            ) : (
              <ProfileOverview profile={profile} />
            )}
          </div>
        ) : visibleTab === 'skins' ? (
          <SkinsPage />
        ) : visibleTab === 'matches' ? (
          <MatchHistoryPage showHeader={false} />
        ) : (
          <OperationPage />
        )}
      </div>
    </div>
  )
}
