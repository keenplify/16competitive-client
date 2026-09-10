import {
  Check,
  ChevronRight,
  Gamepad2,
  Mail,
  Search,
  UserPlus,
  Users,
  X
} from 'lucide-react'
import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent } from 'react'
import { toast } from 'react-toastify'
import type { FriendPlayer, FriendSearchResult, IncomingFriendRequest } from '../../../../shared/friends'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useFriendsStore } from '../friends/friends.store'
import { MatchSearchPanel } from '../matchmaking/MatchSearchPanel'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { usePartyStore } from './party.store'

interface LobbySocialSidebarProps {
  playerId: string
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  hoverOpenDisabledUntil?: number
}

const initials = (username: string): string => username.slice(0, 2).toUpperCase()

function FriendRow({
  friend,
  canInvite,
  busy,
  onInvite,
  onContextMenu
}: {
  friend: FriendPlayer
  canInvite: boolean
  busy: boolean
  onInvite: () => void
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void
}): JSX.Element {
  const inGame = friend.presence === 'IN_GAME'
  const online = friend.presence !== 'OFFLINE'
  return (
    <div
      className="group flex cursor-context-menu items-center gap-2 border-l-2 border-l-transparent px-3 py-2 transition hover:border-l-sky-400 hover:bg-white/5"
      title="Right-click for friend options"
      onContextMenu={onContextMenu}
    >
      <div
        className={`relative flex size-9 shrink-0 items-center justify-center bg-neutral-800 text-[11px] font-bold ${
          online ? 'text-white' : 'text-neutral-500'
        }`}
      >
        {initials(friend.username)}
        <span
          className={`absolute right-0 bottom-0 size-2.5 border-2 border-neutral-950 ${
            inGame ? 'bg-violet-400' : online ? 'bg-emerald-400' : 'bg-neutral-600'
          }`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs font-semibold ${online ? 'text-neutral-100' : 'text-neutral-500'}`}>
          {friend.username}
        </p>
        <p className={`text-[10px] uppercase ${inGame ? 'text-violet-300' : online ? 'text-emerald-400' : 'text-neutral-600'}`}>
          {inGame ? 'In game' : online ? 'Online' : 'Offline'} · {friend.mmr} MMR
        </p>
      </div>
      <div className="flex items-center opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {canInvite && friend.presence === 'ONLINE' && (
          <button
            type="button"
            className="rounded p-1.5 text-sky-300 hover:bg-sky-400/15 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-400"
            aria-label={`Invite ${friend.username} to party`}
            title="Invite to party"
            disabled={busy}
            onClick={onInvite}
          >
            <Gamepad2 className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

function SearchResultRow({
  player,
  busy,
  onAdd
}: {
  player: FriendSearchResult
  busy: boolean
  onAdd: () => void
}): JSX.Element {
  const actionLabel = {
    NONE: 'Add friend',
    OUTGOING: 'Requested',
    INCOMING: 'Respond above',
    FRIEND: 'Friends'
  }[player.relationship]
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5">
      <div className="flex size-8 items-center justify-center bg-neutral-800 text-[10px] font-bold text-neutral-200">
        {initials(player.username)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-neutral-200">{player.username}</p>
        <p className="text-[10px] text-neutral-500">{player.mmr} MMR</p>
      </div>
      <Button
        variant={player.relationship === 'NONE' ? 'primary' : 'ghost'}
        className="h-7 rounded-none px-2 text-[9px] uppercase"
        disabled={busy || player.relationship !== 'NONE'}
        onClick={onAdd}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

function FriendRequestsModal({
  open,
  requests,
  actingRequestId,
  onClose,
  onAccept,
  onDiscard
}: {
  open: boolean
  requests: IncomingFriendRequest[]
  actingRequestId: string | null
  onClose: () => void
  onAccept: (requestId: string) => void
  onDiscard: (requestId: string) => void
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="friend-requests-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="w-full max-w-sm border border-white/15 bg-neutral-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 bg-linear-to-r from-sky-950/60 to-neutral-950 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] text-sky-300 uppercase">Friends</p>
            <h2 id="friend-requests-title" className="mt-1 text-lg font-semibold text-white">Friend requests</h2>
          </div>
          <button
            type="button"
            className="rounded p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            aria-label="Close friend requests"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {requests.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-neutral-500">No pending friend requests.</p>
          ) : (
            <div className="grid gap-2">
              {requests.map((request) => (
                <article key={request.id} className="flex items-center gap-3 border border-white/10 bg-black/20 p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center bg-neutral-800 text-[10px] font-bold">
                    {initials(request.player.username)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{request.player.username}</p>
                    <p className="text-xs text-neutral-500">Wants to be friends</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded p-2 text-emerald-300 hover:bg-emerald-400/15 focus-visible:outline-2 focus-visible:outline-emerald-300"
                      aria-label={`Accept ${request.player.username}'s friend request`}
                      disabled={actingRequestId === request.id}
                      onClick={() => onAccept(request.id)}
                    >
                      <Check className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-2 text-neutral-500 hover:bg-red-400/10 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-red-300"
                      aria-label={`Discard ${request.player.username}'s friend request`}
                      disabled={actingRequestId === request.id}
                      onClick={() => onDiscard(request.id)}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function LobbySocialSidebar({
  playerId,
  collapsed,
  onCollapsedChange,
  hoverOpenDisabledUntil = 0
}: LobbySocialSidebarProps): JSX.Element | null {
  const hoverOpenTimer = useRef<number | null>(null)
  const searchTimer = useRef<number | null>(null)
  const [friendMenu, setFriendMenu] = useState<{
    friend: FriendPlayer
    x: number
    y: number
  } | null>(null)
  const [friendRequestsOpen, setFriendRequestsOpen] = useState(false)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const party = usePartyStore((state) => state.party)
  const partyInvitations = usePartyStore((state) => state.invitations)
  const partyStatus = usePartyStore((state) => state.status)
  const partyError = usePartyStore((state) => state.error)
  const partyNotice = usePartyStore((state) => state.notice)
  const leave = usePartyStore((state) => state.leave)
  const inviteFriend = usePartyStore((state) => state.invitePlayer)
  const friends = useFriendsStore((state) => state.friends)
  const friendRequests = useFriendsStore((state) => state.incomingRequests)
  const query = useFriendsStore((state) => state.query)
  const results = useFriendsStore((state) => state.results)
  const searching = useFriendsStore((state) => state.searching)
  const actingPlayerId = useFriendsStore((state) => state.actingPlayerId)
  const friendsError = useFriendsStore((state) => state.error)
  const friendsNotice = useFriendsStore((state) => state.notice)
  const setQuery = useFriendsStore((state) => state.setQuery)
  const search = useFriendsStore((state) => state.search)
  const requestFriend = useFriendsStore((state) => state.request)
  const acceptFriend = useFriendsStore((state) => state.accept)
  const discardFriend = useFriendsStore((state) => state.discard)
  const removeFriend = useFriendsStore((state) => state.remove)

  const isSearching = queueStatus === 'joining' || queueStatus === 'queued' || queueStatus === 'leaving'
  const isLeader = !party || party.leaderId === playerId
  const isFull = party?.members.length === 5
  const canInvite = isLeader && !isFull && !isSearching
  const notificationCount = partyInvitations.length + friendRequests.length
  const matchNeedsAttention = ['match_found', 'ready_check', 'countdown', 'starting_server', 'server_ready'].includes(queueStatus)
  const groups = [
    { label: 'In game', items: friends.filter((friend) => friend.presence === 'IN_GAME') },
    { label: 'Online', items: friends.filter((friend) => friend.presence === 'ONLINE') },
    { label: 'Offline', items: friends.filter((friend) => friend.presence === 'OFFLINE') }
  ]

  useEffect(() => {
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
    if (query.trim().length >= 2) {
      searchTimer.current = window.setTimeout(() => void search(), 250)
    }
    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
    }
  }, [query, search])

  useEffect(() => () => {
    if (hoverOpenTimer.current !== null) window.clearTimeout(hoverOpenTimer.current)
  }, [])

  useEffect(() => {
    if (friendsNotice) toast.success(friendsNotice)
  }, [friendsNotice])

  useEffect(() => {
    if (friendsError) toast.error(friendsError)
  }, [friendsError])

  useEffect(() => {
    if (partyNotice) toast.success(partyNotice)
  }, [partyNotice])

  useEffect(() => {
    if (partyError) toast.error(partyError)
  }, [partyError])

  useEffect(() => {
    const closeMenu = (): void => setFriendMenu(null)
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setFriendMenu(null)
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  if (matchNeedsAttention) return null

  const expandCollapsedSidebar = (): void => {
    if (hoverOpenTimer.current !== null) window.clearTimeout(hoverOpenTimer.current)
    hoverOpenTimer.current = null
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
    if (hoverOpenTimer.current !== null) window.clearTimeout(hoverOpenTimer.current)
    hoverOpenTimer.current = null
  }
  const handleCollapsedKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!collapsed || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onCollapsedChange(false)
  }
  const showFriendMenu = (event: MouseEvent<HTMLDivElement>, friend: FriendPlayer): void => {
    event.preventDefault()
    setFriendMenu({ friend, x: event.clientX, y: event.clientY })
  }
  const handleRemoveFriend = (): void => {
    if (!friendMenu) return
    const { id } = friendMenu.friend
    setFriendMenu(null)
    void removeFriend(id)
  }

  return (
    <>
      <div className={`fixed top-4 right-14 z-20 w-52 transition-all duration-300 ease-out ${collapsed && isSearching ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0'}`}>
        <MatchSearchPanel variant="compact" className="rounded-md" />
      </div>
      <aside
        className={`fixed right-0 z-20 overflow-hidden bg-neutral-950/95 text-white shadow-2xl backdrop-blur-md transition-[width,max-height,height,background-color] duration-300 ease-out ${collapsed ? 'top-0 h-screen w-11 cursor-pointer border border-r-0 border-white/10 text-neutral-300 hover:bg-neutral-900 hover:text-white' : `${isSearching ? 'flex' : 'hidden'} bottom-0 max-h-[70vh] w-full border-t border-white/10 md:top-0 md:flex md:h-screen md:max-h-none md:w-72 md:border-t-0 md:border-l`}`}
        aria-label={collapsed ? 'Expand Friends panel' : 'Friends panel'}
        role={collapsed ? 'button' : undefined}
        tabIndex={collapsed ? 0 : undefined}
        onClick={expandCollapsedSidebar}
        onKeyDown={handleCollapsedKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={`absolute inset-0 flex flex-col items-center transition-all duration-200 ${collapsed ? 'translate-x-0 opacity-100 delay-100' : 'pointer-events-none translate-x-3 opacity-0'}`} aria-hidden={!collapsed}>
          <div className="relative mt-5 rounded p-2">
            <Users className="size-4" aria-hidden="true" />
            {notificationCount > 0 && <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-neutral-950">{notificationCount}</span>}
          </div>
        </div>

        <div className={`flex h-full min-w-72 flex-1 flex-col transition-all duration-250 ease-out ${collapsed ? 'pointer-events-none translate-x-4 opacity-0' : 'translate-x-0 opacity-100 delay-75'}`} aria-hidden={collapsed}>
          <MatchSearchPanel className="static w-full max-w-none shrink-0 rounded-none border-x-0 border-t-0 shadow-none" />
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-linear-to-r from-sky-950/60 to-neutral-950 px-4">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-sky-300" aria-hidden="true" />
              <h2 className="text-xs font-bold tracking-[0.16em] text-neutral-100 uppercase">Friends · {friends.length}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="relative rounded p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-default disabled:opacity-40"
                aria-label={friendRequests.length > 0 ? `Friend requests (${friendRequests.length})` : 'No friend requests'}
                title={friendRequests.length > 0 ? 'Friend requests' : 'No friend requests'}
                disabled={friendRequests.length === 0}
                onClick={() => setFriendRequestsOpen(true)}
              >
                <Mail className="size-3.5" aria-hidden="true" />
                {friendRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-neutral-950">
                    {friendRequests.length}
                  </span>
                )}
              </button>
              {party && <Button variant="ghost" className="h-7 px-2 text-[9px] uppercase" disabled={partyStatus === 'leaving'} onClick={() => void leave()}>{isLeader ? 'Disband' : 'Leave'}</Button>}
              <button type="button" className="rounded p-1 text-neutral-500 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400" aria-label="Collapse Friends panel" onClick={() => onCollapsedChange(true)}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="shrink-0 border-b border-white/10 p-3">
            <TextField
              id="friend-search"
              label="Find players"
              leadingIcon={<Search className="size-3.5" />}
              className="h-9 rounded-none pl-8"
              value={query}
              maxLength={32}
              autoComplete="off"
              placeholder="Search username"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query.trim().length >= 2 && (
              <div className="mt-2 max-h-40 overflow-y-auto border border-white/10 bg-black/30">
                {searching && <p className="p-3 text-xs text-neutral-500">Searching…</p>}
                {!searching && results.length === 0 && <p className="p-3 text-xs text-neutral-500">No players found.</p>}
                {!searching && results.map((player) => <SearchResultRow key={player.id} player={player} busy={actingPlayerId === player.id} onAdd={() => void requestFriend(player.id)} />)}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {groups.map((group) => group.items.length > 0 && (
              <section key={group.label} className="mb-2">
                <h3 className="px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-neutral-500 uppercase">{group.label} · {group.items.length}</h3>
                {group.items.map((friend) => <FriendRow key={friend.id} friend={friend} canInvite={canInvite} busy={actingPlayerId === friend.id || partyStatus === 'inviting'} onInvite={() => void inviteFriend(friend.username)} onContextMenu={(event) => showFriendMenu(event, friend)} />)}
              </section>
            ))}
            {friends.length === 0 && query.trim().length < 2 && (
              <div className="flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center"><div className="flex size-10 items-center justify-center border border-white/10 bg-white/5"><UserPlus className="size-4 text-neutral-500" /></div><p className="mt-3 text-sm font-medium text-neutral-300">Build your squad</p><p className="mt-1 max-w-44 text-xs leading-relaxed text-neutral-600">Find players above, add them, then invite online friends to your party.</p></div>
            )}
          </div>
        </div>
      </aside>
      {friendMenu && (
        <div
          className="fixed z-50 min-w-40 overflow-hidden border border-white/15 bg-neutral-800 py-1 shadow-xl"
          style={{ left: friendMenu.x, top: friendMenu.y }}
          role="menu"
          aria-label={`Friend options for ${friendMenu.friend.username}`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-400/10 focus-visible:bg-red-400/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            role="menuitem"
            disabled={actingPlayerId === friendMenu.friend.id}
            onClick={handleRemoveFriend}
          >
            Remove friend
          </button>
        </div>
      )}
      <FriendRequestsModal
        open={friendRequestsOpen}
        requests={friendRequests}
        actingRequestId={actingPlayerId}
        onClose={() => setFriendRequestsOpen(false)}
        onAccept={(requestId) => void acceptFriend(requestId)}
        onDiscard={(requestId) => void discardFriend(requestId)}
      />
    </>
  )
}
