import { ChevronRight, Mail, UserPlus, Users } from 'lucide-react'
import { useEffect, useRef, type FormEvent, type JSX, type KeyboardEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { MatchSearchPanel } from '../matchmaking/MatchSearchPanel'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { usePartyStore } from './party.store'

interface LobbySocialSidebarProps {
  playerId: string
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  hoverOpenDisabledUntil?: number
}

export function LobbySocialSidebar({
  playerId,
  collapsed,
  onCollapsedChange,
  hoverOpenDisabledUntil = 0
}: LobbySocialSidebarProps): JSX.Element | null {
  const hoverOpenTimer = useRef<number | null>(null)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const party = usePartyStore((state) => state.party)
  const invitations = usePartyStore((state) => state.invitations)
  const inviteUsername = usePartyStore((state) => state.inviteUsername)
  const status = usePartyStore((state) => state.status)
  const error = usePartyStore((state) => state.error)
  const notice = usePartyStore((state) => state.notice)
  const setInviteUsername = usePartyStore((state) => state.setInviteUsername)
  const invite = usePartyStore((state) => state.invite)
  const leave = usePartyStore((state) => state.leave)
  const isSearching =
    queueStatus === 'joining' || queueStatus === 'queued' || queueStatus === 'leaving'
  const isLeader = !party || party.leaderId === playerId
  const isFull = party?.members.length === 5
  const matchNeedsAttention = [
    'match_found',
    'ready_check',
    'countdown',
    'starting_server',
    'server_ready'
  ].includes(queueStatus)

  useEffect(() => {
    return () => {
      if (hoverOpenTimer.current !== null) window.clearTimeout(hoverOpenTimer.current)
    }
  }, [])

  if (matchNeedsAttention) return null

  const handleInvite = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void invite()
  }

  const expandCollapsedSidebar = (): void => {
    if (hoverOpenTimer.current !== null) {
      window.clearTimeout(hoverOpenTimer.current)
      hoverOpenTimer.current = null
    }
    if (collapsed) onCollapsedChange(false)
  }

  const handleMouseEnter = (): void => {
    if (!collapsed || Date.now() < hoverOpenDisabledUntil) return
    hoverOpenTimer.current = window.setTimeout(() => {
      hoverOpenTimer.current = null
      if (Date.now() >= hoverOpenDisabledUntil) onCollapsedChange(false)
    }, 100)
  }

  const handleMouseLeave = (): void => {
    if (hoverOpenTimer.current !== null) {
      window.clearTimeout(hoverOpenTimer.current)
      hoverOpenTimer.current = null
    }
  }

  const handleCollapsedKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!collapsed || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onCollapsedChange(false)
  }

  return (
    <>
      <div
        className={`fixed top-4 right-14 z-20 w-52 transition-all duration-300 ease-out ${
          collapsed && isSearching
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none translate-x-4 opacity-0'
        }`}
      >
        <MatchSearchPanel variant="compact" className="rounded-md" />
      </div>

      <aside
        className={`fixed right-0 z-20 overflow-hidden bg-neutral-950/90 text-white shadow-2xl backdrop-blur-md transition-[width,max-height,height,background-color] duration-300 ease-out ${
          collapsed
            ? 'top-0 h-screen w-11 cursor-pointer border border-r-0 border-white/10 text-neutral-300 hover:bg-neutral-900 hover:text-white'
            : `${isSearching ? 'flex' : 'hidden'} bottom-0 max-h-[55vh] w-full border-t border-white/10 md:top-0 md:flex md:h-screen md:max-h-none md:w-72 md:border-t-0 md:border-l`
        }`}
        aria-label={collapsed ? 'Expand Friends panel' : 'Friends panel'}
        role={collapsed ? 'button' : undefined}
        tabIndex={collapsed ? 0 : undefined}
        onClick={expandCollapsedSidebar}
        onKeyDown={handleCollapsedKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`absolute inset-0 flex flex-col items-center transition-all duration-200 ${
            collapsed
              ? 'translate-x-0 opacity-100 delay-100'
              : 'pointer-events-none translate-x-3 opacity-0'
          }`}
          aria-hidden={!collapsed}
        >
          <div className="mt-5 rounded p-2">
            <Users className="size-4" aria-hidden="true" />
          </div>
          <div className="mt-auto mb-5 flex flex-col items-center gap-4">
            <span className="relative" title="Party invitations" aria-label="Party invitations">
              <Mail className="size-4" aria-hidden="true" />
              {invitations.length > 0 && (
                <span className="absolute -top-2 -right-2 flex size-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-neutral-950">
                  {invitations.length}
                </span>
              )}
            </span>
          </div>
        </div>

        <div
          className={`flex h-full min-w-72 flex-1 flex-col transition-all duration-250 ease-out ${
            collapsed
              ? 'pointer-events-none translate-x-4 opacity-0'
              : 'translate-x-0 opacity-100 delay-75'
          }`}
          aria-hidden={collapsed}
        >
          <MatchSearchPanel className="static w-full max-w-none shrink-0 rounded-none border-x-0 border-t-0 shadow-none" />

          <section className="flex min-h-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-white/5 px-4">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-neutral-300" aria-hidden="true" />
                <h2 className="text-xs font-bold tracking-[0.16em] text-neutral-200 uppercase">
                  {party ? `Party · ${party.members.length} / 5` : 'Friends'}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                {party ? (
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-[10px] tracking-[0.1em] uppercase"
                    disabled={status === 'leaving'}
                    onClick={() => void leave()}
                  >
                    {status === 'leaving' ? 'Leaving…' : isLeader ? 'Disband' : 'Leave'}
                  </Button>
                ) : (
                  <UserPlus className="size-4 text-neutral-500" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="rounded p-1 text-neutral-500 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                  aria-label="Collapse Friends panel"
                  onClick={() => onCollapsedChange(true)}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
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
        </div>
      </aside>
    </>
  )
}
