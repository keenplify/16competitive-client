import { Bot } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

type PlayerPresence = 'in-game' | 'online' | 'offline'

interface PlayerAvatarProps {
  username: string
  isBot?: boolean
  presence?: PlayerPresence
  badge?: ReactNode
  className?: string
}

const initials = (username: string): string => username.trim().slice(0, 2).toUpperCase()

export function PlayerAvatar({
  username,
  isBot = false,
  presence,
  badge,
  className
}: PlayerAvatarProps): JSX.Element {
  return (
    <span
      className={twMerge(
        'relative grid size-8 shrink-0 place-items-center border border-white/10 bg-neutral-800 text-[10px] font-bold text-neutral-200',
        presence === 'offline' && 'text-neutral-500',
        className
      )}
      aria-hidden="true"
    >
      {isBot ? <Bot className="size-4" /> : initials(username)}
      {badge}
      {presence && (
        <span
          className={twMerge(
            'absolute right-0 bottom-0 size-2.5 border-2 border-neutral-950 bg-neutral-600',
            presence === 'online' && 'bg-emerald-400',
            presence === 'in-game' && 'bg-violet-400'
          )}
        />
      )}
    </span>
  )
}
