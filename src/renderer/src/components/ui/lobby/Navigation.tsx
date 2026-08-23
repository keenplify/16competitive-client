import { Logo } from '../Logo'
import { ReactNode, type JSX, useEffect, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'

const pages = ['Play', 'Leaderboard', 'Store', 'News', 'Settings', 'Profile']

interface LobbyNavigationProps {
  className?: string
}

export function LobbyNavigation({ className }: LobbyNavigationProps): JSX.Element {
  const [activePage, setActivePage] = useState('Play')

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
    }
  }, [activePage])

  return (
    <nav className={twMerge('flex bg-gray-500/20', className)}>
      <Logo />

      <ul ref={navRef} className="relative ml-auto flex gap-2 capitalize">
        {/* Moving blue bar + glow */}
        <div
          className="
            pointer-events-none
            absolute bottom-0
            z-20
            h-0.5
            bg-blue-400
            shadow-[0_0_6px_2px_rgba(59,130,246,0.8)]
            transition-all
            duration-300
            ease-out
          "
          style={{
            left: indicator.left,
            width: indicator.width
          }}
        />

        {pages.map((page) => (
          <PageButton
            key={page}
            active={activePage === page}
            onClick={(element) => {
              setActivePage(page)
              updateIndicator(element)
            }}
          >
            {page}
          </PageButton>
        ))}
      </ul>
    </nav>
  )
}

function PageButton({ children, active, onClick }: PageButtonProps): JSX.Element {
  const buttonRef = useRef<HTMLLIElement>(null)

  return (
    <li
      ref={buttonRef}
      data-page={children}
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
        px-6
        py-2
        text-xl
        font-bold
        ${active ? 'text-blue-400' : 'text-white'}
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
  active?: boolean
  onClick?: (element: HTMLElement) => void
}
