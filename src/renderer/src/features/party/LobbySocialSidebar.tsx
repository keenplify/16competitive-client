import { UserPlus, Users } from 'lucide-react'
import type { FormEvent, JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { MatchSearchPanel } from '../matchmaking/MatchSearchPanel'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { usePartyStore } from './party.store'

interface LobbySocialSidebarProps {
  playerId: string
}

export function LobbySocialSidebar({ playerId }: LobbySocialSidebarProps): JSX.Element | null {
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const party = usePartyStore((state) => state.party)
  const inviteUsername = usePartyStore((state) => state.inviteUsername)
  const status = usePartyStore((state) => state.status)
  const error = usePartyStore((state) => state.error)
  const notice = usePartyStore((state) => state.notice)
  const setInviteUsername = usePartyStore((state) => state.setInviteUsername)
  const invite = usePartyStore((state) => state.invite)
  const isSearching = queueStatus === 'queued' || queueStatus === 'leaving'
  const isLeader = !party || party.leaderId === playerId
  const isFull = party?.members.length === 5
  const matchNeedsAttention = [
    'ready_check',
    'countdown',
    'starting_server',
    'server_ready'
  ].includes(queueStatus)

  if (matchNeedsAttention) return null

  const handleInvite = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void invite()
  }

  return (
    <aside
      className={`${isSearching ? 'flex' : 'hidden'} fixed right-0 bottom-0 z-20 max-h-[55vh] w-full flex-col border-t border-white/10 bg-neutral-950/90 text-white shadow-2xl backdrop-blur-md md:top-20 md:flex md:max-h-none md:w-72 md:border-t-0 md:border-l`}
    >
      <MatchSearchPanel className="static w-full max-w-none shrink-0 rounded-none border-x-0 border-t-0 shadow-none" />

      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-white/5 px-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-neutral-300" aria-hidden="true" />
            <h2 className="text-xs font-bold tracking-[0.16em] text-neutral-200 uppercase">
              Friends
            </h2>
          </div>
          <UserPlus className="size-4 text-neutral-500" aria-hidden="true" />
        </header>

        {isLeader && !isFull && !isSearching && (
          <form className="shrink-0 border-b border-white/10 p-3" onSubmit={handleInvite}>
            <TextField
              id="friends-invite-username"
              label="Invite by username"
              className="h-9 rounded-none"
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
              className="mt-2 h-8 w-full rounded-none text-[11px] tracking-[0.14em] uppercase"
              type="submit"
              disabled={status === 'inviting'}
            >
              {status === 'inviting' ? 'Sending…' : 'Invite player'}
            </Button>
          </form>
        )}

        <div className="min-h-5 shrink-0 px-3 pt-2" aria-live="polite">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!error && notice && <p className="text-xs text-emerald-400">{notice}</p>}
        </div>

        <div className="flex min-h-32 flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <div className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Users className="size-4 text-neutral-500" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium text-neutral-300">Friends list coming soon</p>
          <p className="mt-1 max-w-44 text-xs leading-relaxed text-neutral-600">
            Online friends and party invites will appear here.
          </p>
        </div>
      </section>
    </aside>
  )
}
