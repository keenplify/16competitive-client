import { Logo } from '../Logo'
import { ReactNode, type JSX, useEffect, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import type { LobbyPageId } from '../../../features/navigation/navigation.store'
import { ChevronLeft } from 'lucide-react'

const pages = [
  { id: 'play', label: 'Play' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'store', label: 'Store' },
  { id: 'news', label: 'News' },
  { id: 'settings', label: 'Settings' },
  { id: 'profile', label: 'Profile' }
] as const satisfies ReadonlyArray<{ id: Exclude<LobbyPageId, 'lobby'>; label: string }>

interface LobbyNavigationProps {
  activePage: LobbyPageId
  onNavigate: (page: LobbyPageId) => void
  className?: string
  showBackToLobby?: boolean
}

export function LobbyNavigation({
  activePage,
  onNavigate,
  className,
  showBackToLobby = true
}: LobbyNavigationProps): JSX.Element {
  const navRef = useRef<HTMLUListElement>(null)

  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0
  })

  const updateIndicator = (element: HTMLElement): void => {
    const nav = navRef.current

    if (!nav) return

    const navRect = nav.getBoundingClientRect()
    const rect = element.getBoundingClientRect()

    setIndicator({
      left: rect.left - navRect.left,
      width: rect.width
    })
  }

  useEffect(() => {
    const activeElement = navRef.current?.querySelector(
      `[data-page="${activePage}"]`
    ) as HTMLElement | null

    if (activeElement) {
      updateIndicator(activeElement)
    } else {
      setIndicator((current) => ({ left: current.left, width: 0 }))
    }
  }, [activePage])

  return (
    <nav
      className={twMerge(
        'flex h-16 w-full overflow-hidden bg-gray-950/70 backdrop-blur-md sm:h-20',
        className
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400"
        aria-label="Open party lobby"
        onClick={() => onNavigate('lobby')}
      >
        <Logo />
      </button>
      {showBackToLobby && (
        <button
          type="button"
          className={twMerge(
            'shrink-0 px-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase cursor-pointer transition hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400 sm:px-3 flex items-center gap-2',
            activePage !== 'lobby' ? 'opacity-100' : 'opacity-0'
          )}
          aria-label="Back to Lobby"
          onClick={() => onNavigate('lobby')}
        >
          <ChevronLeft size="1.25em" /> Back to Lobby
        </button>
      )}

      <ul
        ref={navRef}
        className="relative ml-auto flex min-w-0 gap-0 overflow-x-auto capitalize sm:gap-2"
      >
        {/* Moving blue bar + glow */}
        <div
          className={twMerge(
            'pointer-events-none absolute bottom-0 z-20 h-0.5 bg-blue-400 shadow-[0_0_6px_2px_rgba(59,130,246,0.8)] transition-all duration-300 ease-out',
            pages.some((p) => p.id === activePage) ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            left: indicator.left,
            width: indicator.width
          }}
        />

        {pages.map(({ id, label }) => (
          <PageButton
            key={id}
            page={id}
            active={activePage === id}
            onClick={(element) => {
              onNavigate(id)
              updateIndicator(element)
            }}
          >
            {label}
          </PageButton>
        ))}
      </ul>
    </nav>
  )
}

function PageButton({ children, page, active, onClick }: PageButtonProps): JSX.Element {
  const buttonRef = useRef<HTMLLIElement>(null)

  return (
    <li
      ref={buttonRef}
      data-page={page}
      onClick={() => {
        if (buttonRef.current) {
          onClick?.(buttonRef.current)
        }
      }}
      className={`
        relative
        flex
        cursor-pointer
        items-center
        justify-center
        px-3
        sm:px-6
        py-2
        text-sm
        sm:text-xl
        font-bold
        ${active ? 'text-blue-400' : 'text-white'}
        hover:text-blue-100
        active:text-blue-200
      `}
    >
      {active && (
        <span className="nav-active-bg pointer-events-none absolute inset-x-0 bottom-0 z-0" />
      )}

      <span className="relative z-10">{children}</span>
    </li>
  )
}

interface PageButtonProps {
  children: ReactNode
  page: Exclude<LobbyPageId, 'lobby'>
  active?: boolean
  onClick?: (element: HTMLElement) => void
}
