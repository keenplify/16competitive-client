import { ProfileLoadout } from './ProfileLoadout'
import { ProfileHistory } from './ProfileHistory'
import { useEffect, useState, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useAuthStore } from '../auth/auth.store'
import { useProfileStore } from './profile.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useTranslation } from '../i18n/i18n'
import { Button } from '../../components/ui/Button'
import { TabList } from '../../components/ui/TabList'
import { ProfileOverview } from './ProfileOverview'
import { SkinsPage } from '../skins/SkinsPage'
import { MatchHistoryPage } from './MatchHistoryPage'
import { OperationPage } from '../operations/OperationPage'

export function ProfilePage({ playerId }: { playerId?: string }): JSX.Element {
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null)
  const accountId = useAuthStore((state) => state.session?.player.id)
  const id = playerId ?? accountId
  const own = id === accountId
  const entry = useProfileStore((state) => (id ? state.entries[id] : undefined))
  const load = useProfileStore((state) => state.load)
  const tab = useNavigationStore((state) => state.profileTab)
  const setTab = useNavigationStore((state) => state.setProfileTab)
  const { t } = useTranslation()
  const publicTab = useProfileStore((state) => state.tab)
  const setPublicTab = useProfileStore((state) => state.setTab)
  const visibleTab = playerId ? publicTab : tab
  useEffect(() => {
    if (id) void load(id)
  }, [id, load])
  const profile = entry?.profile
  return (
    <div
      className={
        playerId
          ? 'profile-page w-full px-6 pb-4 pt-0 text-left text-white sm:px-10'
          : 'profile-page w-full p-6 text-left text-white sm:p-10'
      }
    >
      <div className="mx-auto w-full max-w-[1800px]">
        {
          <div className="profile-toolbar sticky top-0 z-10 flex flex-wrap items-end justify-between gap-3">
            <TabList
              className="profile-tabs min-w-0 flex-1"
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
            {visibleTab === 'skins' && own && !playerId && (
              <div ref={setToolbarTarget} className="flex min-h-8 shrink-0 items-center pb-1" />
            )}
          </div>
        }
        {visibleTab === 'overview' || !own || Boolean(playerId) ? (
          <div>
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
              <ProfileOverview profile={profile} own={own} compact={Boolean(playerId)} />
            )}
          </div>
        ) : visibleTab === 'skins' ? (
          <SkinsPage toolbarTarget={toolbarTarget} />
        ) : visibleTab === 'matches' ? (
          <MatchHistoryPage showHeader={false} />
        ) : (
          <OperationPage />
        )}
      </div>
    </div>
  )
}
