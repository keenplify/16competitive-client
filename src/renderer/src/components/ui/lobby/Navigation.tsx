import { isWebRuntime } from '../../../web-runtime'
import { useWebHelperPromptStore } from '../../../features/matchmaking/web-helper-prompt.store'
import { useAdminDemosStore } from '../../../features/admin-demos/admin-demos.store'
import type { JSX } from 'react'
import { ClipboardList, Gift, House, Play, Settings } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { TranslationKey } from '../../../features/i18n/i18n'
import { useTranslation } from '../../../features/i18n/i18n'
import type { LobbyPageId } from '../../../features/navigation/navigation.store'
import { pageIcons } from '../../../features/navigation/page-icons'
import { DailyQuestsPanel } from '../../../features/daily-quests/DailyQuestsPanel'
import type { DailyQuestSnapshot } from '../../../../../shared/daily-quests'
import { useMatchmakingStore } from '../../../features/matchmaking/matchmaking.store'
import { displayedPlayWindowNode } from '../../../features/matchmaking/play-window-node'
import { PlayWindowStatus } from '../../../features/matchmaking/PlayWindowStatus'
import { useHeaderScrolled } from './useHeaderScrolled'
import { useCommunitiesStore } from '../../../features/communities/communities.store'
import { usePartnerBrandingStore } from '../../../features/partner-branding/partner-branding.store'

const pages = [
  { id: 'demos', labelKey: 'nav.demos', icon: pageIcons.demos },
  { id: 'profile', labelKey: 'nav.inventory', icon: pageIcons.profile },
  { id: 'leaderboard', labelKey: 'nav.leaderboard', icon: pageIcons.leaderboard },
  { id: 'play', labelKey: 'nav.play', icon: pageIcons.play },
  { id: 'store', labelKey: 'nav.store', icon: pageIcons.store },
  { id: 'communities', labelKey: 'directory.title', icon: pageIcons.communities }
] as const satisfies ReadonlyArray<{
  id: Exclude<LobbyPageId, 'lobby' | 'settings'>
  labelKey: TranslationKey
  icon: typeof Play
}>

interface LobbyNavigationProps {
  activePage: LobbyPageId
  onNavigate: (page: LobbyPageId) => void
  className?: string
  showBackToLobby?: boolean
  locked?: boolean
  missionsOpen: boolean
  onToggleMissions: () => void
  missionSnapshot: DailyQuestSnapshot | null
  missionLoading: boolean
  missionError: string | null
  showDeferredSurvey?: boolean
  onOpenDeferredSurvey?: () => void
}

export function LobbyNavigation({
  activePage,
  onNavigate,
  className,
  locked = false,
  missionsOpen,
  onToggleMissions,
  missionSnapshot,
  missionLoading,
  missionError,
  showDeferredSurvey = false,
  onOpenDeferredSurvey
}: LobbyNavigationProps): JSX.Element {
  const { t } = useTranslation()
  const scrolled = useHeaderScrolled(activePage)
  const canReview = useAdminDemosStore((state) => state.allowed)
  const communityName = useCommunitiesStore((state) => state.currentCommunity?.name)
  const canBypassLeaveRestriction = useCommunitiesStore((state) => state.canBypassLeaveRestriction)
  const leaveRestricted = usePartnerBrandingStore(
    (state) => state.branding?.allowOtherCommunities === false
  )
  const communityLabel =
    leaveRestricted && !canBypassLeaveRestriction && communityName
      ? communityName
      : t('directory.title')
  const nodes = useMatchmakingStore((state) => state.nodes)
  const selectedNodeId = useMatchmakingStore((state) => state.selectedNodeId)
  const playWindowNode = displayedPlayWindowNode(nodes, selectedNodeId)
  const canNavigate = (page: LobbyPageId): boolean =>
    !locked || page === 'settings' || page === 'play'
  const activeMissions =
    missionSnapshot?.quests.filter((quest) => !quest.completed && quest.progress < quest.target)
      .length ?? 0

  return (
    <nav
      data-i18n-skip
      className={twMerge(
        'pointer-events-none fixed inset-x-0 top-0 z-30 flex h-16 items-center px-3 sm:h-20 sm:px-5',
        className
      )}
      aria-label={t('nav.lobbyNavigation')}
    >
      <span
        aria-hidden="true"
        className={twMerge(
          'pointer-events-none absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none',
          scrolled ? 'opacity-100' : 'opacity-0',
          'lobby-header-scroll-shade'
        )}
        style={{
          backgroundImage:
            'linear-gradient(to bottom, var(--partner-primary, var(--color-sky-950)) 0%, transparent 100%)'
        }}
      />
      <div className="pointer-events-auto relative z-10 flex items-center gap-1.5 p-1.5">
        <IconButton
          label={t('nav.home')}
          audioSfx="backward"
          active={activePage === 'lobby'}
          disabled={!canNavigate('lobby')}
          onClick={() => onNavigate('lobby')}
        >
          <House className="size-4 sm:size-[1.125rem]" aria-hidden="true" />
        </IconButton>
        <IconButton
          label={t('nav.settings')}
          audioSfx="forward"
          active={activePage === 'settings'}
          disabled={!canNavigate('settings')}
          onClick={() => onNavigate('settings')}
        >
          <Settings className="size-4 sm:size-[1.125rem]" aria-hidden="true" />
        </IconButton>
        <div className="relative" data-missions-ui>
          <button
            type="button"
            data-audio-sfx="forward"
            data-idle-hint-target="missions"
            aria-label={`Daily missions${activeMissions ? `, ${activeMissions} active` : ''}`}
            aria-expanded={missionsOpen}
            aria-controls="nav-daily-missions"
            onClick={onToggleMissions}
            disabled={locked}
            className={twMerge(
              'relative grid size-8 place-items-center text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:size-9',
              missionsOpen && 'bg-white/10 text-sky-200'
            )}
          >
            <ClipboardList className="size-4 sm:size-[1.125rem]" aria-hidden="true" />
            {activeMissions > 0 && (
              <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-sky-400 px-0.5 text-[10px] font-bold leading-4 text-black">
                {activeMissions}
              </span>
            )}
          </button>
          {missionsOpen && (
            <div
              id="nav-daily-missions"
              className="absolute top-full left-0 mt-3 w-[min(20rem,calc(100vw-2rem))] border border-white/15 bg-neutral-950/95 p-2 shadow-2xl backdrop-blur-md"
            >
              <h2 className="px-2 pb-2 text-sm font-semibold text-white">Daily missions</h2>
              <PlayWindowStatus
                playWindow={playWindowNode?.playWindow}
                visible={missionsOpen}
                className="mx-2 mb-2"
              />
              <DailyQuestsPanel
                snapshot={missionSnapshot}
                loading={missionLoading}
                error={missionError}
                compact
              />
            </div>
          )}
        </div>
        {showDeferredSurvey && (
          <IconButton
            label={t('mapFeedback.openPending')}
            audioSfx="forward"
            active={false}
            disabled={locked}
            onClick={() => onOpenDeferredSurvey?.()}
          >
            <Gift className="size-4 text-amber-300 sm:size-[1.125rem]" aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <div className="pointer-events-auto absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 p-1.5 sm:gap-1 sm:p-2">
        {pages.map(({ id, icon: Icon, labelKey }) => {
          if (id === 'demos' && !canReview) return null
          const active = activePage === id
          const isPlay = id === 'play'
          const label = id === 'communities' ? communityLabel : t(labelKey)

          return (
            <button
              key={id}
              type="button"
              data-audio-sfx="forward"
              data-idle-hint-target={isPlay ? 'play' : undefined}
              disabled={!canNavigate(id)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                onNavigate(id)
                if (id === 'play' && isWebRuntime())
                  void useWebHelperPromptStore.getState().checkNative()
              }}
              className={twMerge(
                'group relative inline-flex h-9 items-center justify-center gap-2  px-2.5 text-xs font-bold tracking-[0.08em] text-white/80 uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] transition duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:px-4 sm:text-sm',
                active &&
                  'bg-white/10 text-sky-200 after:absolute after:-top-3.5 after:left-1/2 after:h-0.5 after:w-[calc(100%+0.5rem)] after:-translate-x-1/2 after:bg-sky-300 after:shadow-[0_0_10px_rgba(125,211,252,0.95)] sm:after:-top-5',
                isPlay && 'px-3 text-white sm:px-5',
                isPlay &&
                  active &&
                  'bg-sky-500 text-white shadow-[0_0_22px_rgba(14,165,233,0.65)] hover:bg-sky-400'
              )}
            >
              <Icon
                className={twMerge(
                  'relative z-10 size-3.5 transition-transform group-hover:scale-110 sm:size-4',
                  isPlay && 'fill-current text-sky-300'
                )}
                aria-hidden="true"
              />
              <span className="relative z-10 hidden max-w-36 truncate sm:inline">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

interface IconButtonProps {
  label: string
  active: boolean
  disabled: boolean
  audioSfx: 'forward' | 'backward'
  onClick: () => void
  children: JSX.Element
}

function IconButton({
  label,
  active,
  disabled,
  audioSfx,
  onClick,
  children
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      data-audio-sfx={audioSfx}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={twMerge(
        'grid size-8 place-items-center  text-white/80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-40 sm:size-9',
        active &&
          'bg-white/10 text-sky-200 after:absolute after:-top-3.5 after:left-1/2 after:h-0.5 after:w-[calc(100%+0.25rem)] after:-translate-x-1/2 after:bg-sky-300 after:shadow-[0_0_10px_rgba(125,211,252,0.95)] sm:after:-top-5'
      )}
    >
      {children}
    </button>
  )
}
