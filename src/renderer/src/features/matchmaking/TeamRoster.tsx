import type { JSX } from 'react'
import type { QueuedPlayer } from '../../../../shared/matchmaking'
import { twMerge } from 'tailwind-merge'

interface TeamRosterProps {
  name: string
  players: QueuedPlayer[]
  className?: string
}

export function TeamRoster({ className, name, players }: TeamRosterProps): JSX.Element {
  return (
    <section className={twMerge('rounded-xl border border-white/10 bg-neutral-900 p-5', className)}>
      <h3 className="mb-4 text-xs font-bold tracking-[0.18em] text-neutral-500 uppercase">
        {name}
      </h3>
      <ul className="grid gap-2">
        {players.map((player) => (
          <li
            key={player.id}
            className="flex items-center justify-between rounded-md bg-black/20 px-3 py-2"
          >
            <span className="text-sm font-medium text-neutral-200">{player.username}</span>
            <span className="text-xs text-neutral-500">{player.mmr} MMR</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
