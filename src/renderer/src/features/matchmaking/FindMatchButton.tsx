import type { ComponentProps, JSX, ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'

export function FindMatchButton({
  className,
  children,
  ...props
}: ComponentProps<typeof Button>): JSX.Element {
  return (
    <Button
      className={twMerge(
        'play-find-match-cta relative h-12 min-w-52 overflow-hidden rounded-none border border-green-600 bg-[#064b0b] px-6 font-sans text-[17px] font-extrabold tracking-[0.18em] text-lime-400 uppercase hover:bg-[#075a0d] focus-visible:outline-lime-400 disabled:bg-[#064b0b] disabled:text-lime-600',
        className
      )}
      {...props}
    >
      {children}
    </Button>
  )
}

export function PlayQueueActions({
  friendsCollapsed,
  className,
  children
}: {
  friendsCollapsed: boolean
  className?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div
      className={twMerge(
        'play-queue-actions fixed right-4 bottom-4 z-40 flex items-center gap-3 sm:bottom-6',
        friendsCollapsed ? 'md:right-[3.75rem]' : 'md:right-[19rem]',
        className
      )}
    >
      {children}
    </div>
  )
}
