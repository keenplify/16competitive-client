import type { JSX } from 'react'
import { House, Newspaper, Play, Settings, ShoppingBag, Trophy, UserRound } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { LobbyPageId } from '../../../features/navigation/navigation.store'

const pages = [
  { id: 'profile', label: 'Inventory', icon: UserRound },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'play', label: 'Play', icon: Play },
  { id: 'store', label: 'Store', icon: ShoppingBag },
  { id: 'news', label: 'News', icon: Newspaper }
] as const satisfies ReadonlyArray<{
  id: Exclude<LobbyPageId, 'lobby' | 'settings'>
  label: string
  icon: typeof Play
}>

interface LobbyNavigationProps {
  activePage: LobbyPageId
  onNavigate: (page: LobbyPageId) => void
  className?: string
  showBackToLobby?: boolean
  locked?: boolean
}

export function LobbyNavigation({
  activePage,
  onNavigate,
  className,
  locked = false
}: LobbyNavigationProps): JSX.Element {
  const canNavigate = (page: LobbyPageId): boolean =>
    !locked || page === 'settings' || page === 'play'

  return (
    <nav
      className={twMerge(
        'pointer-events-none fixed inset-x-0 top-0 z-30 flex h-16 items-center px-3 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-28 before:bg-gradient-to-b before:from-neutral-950/25 before:to-transparent sm:h-20 sm:px-5',
        className
      )}
      aria-label="Lobby navigation"
    >
      <div className="pointer-events-auto relative z-10 flex items-center gap-1.5 p-1.5">
        <IconButton
          label="Home"
          active={activePage === 'lobby'}
          disabled={!canNavigate('lobby')}
          onClick={() => onNavigate('lobby')}
        >
          <House className="size-4 sm:size-[1.125rem]" aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Settings"
          active={activePage === 'settings'}
          disabled={!canNavigate('settings')}
          onClick={() => onNavigate('settings')}
        >
          <Settings className="size-4 sm:size-[1.125rem]" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="pointer-events-auto absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 p-1.5 sm:gap-1 sm:p-2">
        {pages.map(({ id, icon: Icon, label }) => {
          const active = activePage === id
          const isPlay = id === 'play'

          return (
            <button
              key={id}
              type="button"
              disabled={!canNavigate(id)}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(id)}
              className={twMerge(
                'group relative inline-flex h-9 items-center justify-center gap-2 rounded-md px-2.5 text-xs font-bold tracking-[0.08em] text-white/80 uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] transition duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:px-4 sm:text-sm',
                active &&
                  'bg-white/10 text-sky-200 after:absolute after:-top-3.5 after:left-1/2 after:h-0.5 after:w-[calc(100%+0.5rem)] after:-translate-x-1/2 after:bg-sky-300 after:shadow-[0_0_10px_rgba(125,211,252,0.95)] sm:after:-top-5',
                isPlay && 'px-3 text-white sm:px-5',
                isPlay &&
                  active &&
                  'bg-sky-500 text-white shadow-[0_0_22px_rgba(14,165,233,0.65)] hover:bg-sky-400'
              )}
            >
              {isPlay && !active && (
                <>
                  <span className="pointer-events-none absolute -inset-2 rounded-lg bg-sky-400/20 blur-md motion-safe:animate-pulse" />
                  <span className="pointer-events-none absolute -inset-1 rounded-md border border-sky-300/45 opacity-0 motion-safe:animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
                  <span className="pointer-events-none absolute inset-0 rounded-md border border-sky-200/80 motion-safe:animate-[pulse_2.5s_ease-in-out_infinite]" />
                </>
              )}
              <Icon
                className={twMerge(
                  'relative z-10 size-3.5 transition-transform group-hover:scale-110 sm:size-4',
                  isPlay &&
                    'fill-current text-sky-300 motion-safe:animate-[pulse_2.5s_ease-in-out_infinite]'
                )}
                aria-hidden="true"
              />
              <span className="relative z-10 hidden sm:inline">{label}</span>
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
  onClick: () => void
  children: JSX.Element
}

function IconButton({ label, active, disabled, onClick, children }: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={twMerge(
        'grid size-8 place-items-center rounded-md text-white/80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-40 sm:size-9',
        active &&
          'bg-white/10 text-sky-200 after:absolute after:-top-3.5 after:left-1/2 after:h-0.5 after:w-[calc(100%+0.25rem)] after:-translate-x-1/2 after:bg-sky-300 after:shadow-[0_0_10px_rgba(125,211,252,0.95)] sm:after:-top-5'
      )}
    >
      {children}
    </button>
  )
}
