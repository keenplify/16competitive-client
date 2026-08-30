import type { FormEvent, JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { usePartyStore } from './party.store'

interface PartyPanelProps {
  playerId: string
}

export function PartyPanel({ playerId }: PartyPanelProps): JSX.Element {
  const party = usePartyStore((state) => state.party)
  const inviteUsername = usePartyStore((state) => state.inviteUsername)
  const status = usePartyStore((state) => state.status)
  const error = usePartyStore((state) => state.error)
  const notice = usePartyStore((state) => state.notice)
  const setInviteUsername = usePartyStore((state) => state.setInviteUsername)
  const invite = usePartyStore((state) => state.invite)
  const leave = usePartyStore((state) => state.leave)

  const isLeader = !party || party.leaderId === playerId
  const isFull = party?.members.length === 5
  const handleInvite = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void invite()
  }

  return (
    <aside className="border-b border-white/10 bg-neutral-950/75 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-sky-400 uppercase">
            Party · {party?.members.length ?? 1} / 5
          </p>
          <p className="mt-1 truncate text-sm text-neutral-400">
            {party
              ? isLeader
                ? 'You are the leader. Invite players, then queue your whole party.'
                : 'Only the party leader can invite players or start matchmaking.'
              : 'Invite a player by username to create a party.'}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          {isLeader && !isFull && (
            <form className="flex min-w-0 gap-2" onSubmit={handleInvite}>
              <TextField
                id="party-username"
                label="Invite by username"
                className="h-9 min-w-0 sm:w-56"
                value={inviteUsername}
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                autoComplete="off"
                placeholder="player_name"
                disabled={status === 'inviting'}
                onChange={(event) => setInviteUsername(event.target.value)}
              />
              <Button
                className="mt-7 h-9 shrink-0 px-4"
                type="submit"
                disabled={status === 'inviting'}
              >
                {status === 'inviting' ? 'Sending…' : 'Invite'}
              </Button>
            </form>
          )}
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
      <div className="mx-auto mt-2 min-h-5 max-w-[1500px]" aria-live="polite">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!error && notice && <p className="text-xs text-emerald-400">{notice}</p>}
      </div>
    </aside>
  )
}
