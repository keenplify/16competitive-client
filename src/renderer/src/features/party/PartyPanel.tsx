import type { JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { usePartyStore } from './party.store'

interface PartyPanelProps {
  playerId: string
}

export function PartyPanel({ playerId }: PartyPanelProps): JSX.Element {
  const party = usePartyStore((state) => state.party)
  const status = usePartyStore((state) => state.status)
  const leave = usePartyStore((state) => state.leave)

  const isLeader = !party || party.leaderId === playerId

  return (
    <aside className="border-b border-white/10 bg-neutral-950/75 px-4 py-3 backdrop-blur-md sm:px-6 md:mr-72">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-sky-400 uppercase">
            Party · {party?.members.length ?? 1} / 5
          </p>
          <p className="mt-1 truncate text-sm text-neutral-400">
            {party
              ? isLeader
                ? 'You are the leader. Manage invitations from the Friends sidebar.'
                : 'Only the party leader can invite players or start matchmaking.'
              : 'Invite a player from the Friends sidebar to create a party.'}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          {party && (
            <Button
              className="h-9 shrink-0 border border-white/10 px-4"
              variant="ghost"
              disabled={status === 'leaving'}
              onClick={() => void leave()}
            >
              {status === 'leaving' ? 'Leaving…' : isLeader ? 'Disband party' : 'Leave party'}
            </Button>
          )}
        </div>
      </div>
    </aside>
  )
}
