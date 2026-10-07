import { useAdminDemosStore } from '../../../features/admin-demos/admin-demos.store'
import type { JSX } from 'react'
import {
  ClipboardList,
  House,
  Newspaper,
  Play,
  Settings,
  ShoppingBag,
  Trophy,
  UserRound
} from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { TranslationKey } from '../../../features/i18n/i18n'
import { useTranslation } from '../../../features/i18n/i18n'
import type { LobbyPageId } from '../../../features/navigation/navigation.store'
import { DailyQuestsPanel } from '../../../features/daily-quests/DailyQuestsPanel'
import type { DailyQuestSnapshot } from '../../../../../shared/daily-quests'
import { useMatchmakingStore } from '../../../features/matchmaking/matchmaking.store'
import { displayedPlayWindowNode } from '../../../features/matchmaking/play-window-node'
import { PlayWindowStatus } from '../../../features/matchmaking/PlayWindowStatus'

const pages = [
  { id: 'profile', labelKey: 'nav.inventory', icon: UserRound },
  { id: 'leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
  { id: 'play', labelKey: 'nav.play', icon: Play },
  { id: 'store', labelKey: 'nav.store', icon: ShoppingBag },
  { id: 'news', labelKey: 'nav.news', icon: Newspaper }
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
  missionError
}: LobbyNavigationProps): JSX.Element {
  const { t } = useTranslation()
  const canReview = useAdminDemosStore((state) => state.allowed)
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
        'pointer-events-none fixed inset-x-0 top-0 z-30 flex h-16 items-center px-3 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-28 before:bg-gradient-to-b before:from-neutral-950/25 before:to-transparent sm:h-20 sm:px-5',
        className
      )}
      aria-label={t('nav.lobbyNavigation')}
    >
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
              <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-sky-400 px-0.5 text-[10px] font-bold leading-4 text-neutral-950">
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
      </div>

      <div className="pointer-events-auto absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 p-1.5 sm:gap-1 sm:p-2">
        {canReview && (
          <button
            type="button"
            disabled={!canNavigate('demos')}
            onClick={() => onNavigate('demos')}
            className="px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
            aria-current={activePage === 'demos' ? 'page' : undefined}
          >
            Demos
          </button>
        )}
        {pages.map(({ id, icon: Icon, labelKey }) => {
          const active = activePage === id
          const isPlay = id === 'play'

          return (
            <button
              key={id}
              type="button"
              data-audio-sfx="forward"
              data-idle-hint-target={isPlay ? 'play' : undefined}
              disabled={!canNavigate(id)}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(id)}
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
              <span className="relative z-10 hidden sm:inline">{t(labelKey)}</span>
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
