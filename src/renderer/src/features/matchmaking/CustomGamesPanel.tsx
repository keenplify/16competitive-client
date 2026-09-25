import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { Bot, LockKeyhole, Plus, RefreshCw, UserPlus, UserX } from 'lucide-react'
import { toast } from 'react-toastify'
import type {
  CustomGameMember,
  CustomGameMode,
  CustomGameRoom
} from '../../../../shared/custom-games'
import type { MatchmakingMap } from '../../../../shared/matchmaking'
import type { MatchmakingNode } from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { PlayerAvatar } from '../../components/ui/PlayerAvatar'
import { CreateCustomGameModal } from './CreateCustomGameModal'
import { JoinCustomGameModal } from './JoinCustomGameModal'
import { useCustomGamesStore } from './custom-games.store'
import { useMatchmakingStore } from './matchmaking.store'
import { useFriendsStore } from '../friends/friends.store'

interface CustomGamesPanelProps {
  currentPlayerId: string
  maps: MatchmakingMap[]
  nodes: MatchmakingNode[]
  selectedNodeId: string | null
  disabled?: boolean
}

const fieldClass =
  'h-10 border border-white/15 bg-black/35 px-3 text-sm text-white outline-none transition focus:border-sky-400'

const regionLabel = (region: string): string =>
  region === 'sea'
    ? 'SEA'
    : region
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')

const nodeLatency = (node: MatchmakingNode | undefined): number | null =>
  typeof node?.latencyMs === 'number' && Number.isFinite(node.latencyMs)
    ? Math.max(0, Math.round(node.latencyMs))
    : null

const serverTextClass = (latencyMs: number | null, available: boolean): string => {
  if (!available || latencyMs === null) return 'text-red-400'
  if (latencyMs <= 100) return 'text-emerald-400'
  if (latencyMs < 300) return 'text-orange-400'
  return 'text-red-400'
}

export function CustomGamesPanel({
  currentPlayerId,
  maps,
  nodes,
  selectedNodeId,
  disabled = false
}: CustomGamesPanelProps): JSX.Element {
  const rooms = useCustomGamesStore((state) => state.rooms)
  const room = useCustomGamesStore((state) => state.currentRoom)
  const status = useCustomGamesStore((state) => state.status)
  const error = useCustomGamesStore((state) => state.error)
  const refresh = useCustomGamesStore((state) => state.refresh)
  const createModalOpen = useCustomGamesStore((state) => state.createModalOpen)
  const openCreateModal = useCustomGamesStore((state) => state.openCreateModal)
  const updateRoom = useCustomGamesStore((state) => state.updateRoom)
  const joinRoom = useCustomGamesStore((state) => state.joinRoom)
  const leaveRoom = useCustomGamesStore((state) => state.leaveRoom)
  const startRoom = useCustomGamesStore((state) => state.startRoom)
  const addBot = useCustomGamesStore((state) => state.addBot)
  const setTeamCapacity = useCustomGamesStore((state) => state.setTeamCapacity)
  const moveMember = useCustomGamesStore((state) => state.moveMember)
  const moveServer = useCustomGamesStore((state) => state.moveServer)
  const kick = useCustomGamesStore((state) => state.kick)
  const friends = useFriendsStore((state) => state.friends)
  const requestFriend = useFriendsStore((state) => state.request)
  const selectNode = useMatchmakingStore((state) => state.selectNode)
  const supportedMaps = maps.filter(
    ({ supportedModes }) => supportedModes.includes('unrated') || supportedModes.includes('ffa')
  )
  const [passwordRoom, setPasswordRoom] = useState<CustomGameRoom | null>(null)
  const [movingToTeam, setMovingToTeam] = useState<0 | 1 | 2 | null>(null)
  const [memberMenu, setMemberMenu] = useState<{
    member: CustomGameMember
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    void refresh()
    if (passwordRoom) return
    const timer = window.setInterval(() => void refresh(), 2_000)
    return () => window.clearInterval(timer)
  }, [passwordRoom, refresh, selectedNodeId])

  useEffect(() => {
    if (room && room.hostNodeId !== selectedNodeId) void selectNode(room.hostNodeId)
  }, [room, selectNode, selectedNodeId])

  useEffect(() => {
    const close = (): void => setMemberMenu(null)
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', escape)
    }
  }, [])

  const owner = room?.ownerId === currentPlayerId
  const editable = owner && room?.state === 'WAITING'
  const currentMember = room?.members.find(({ id }) => id === currentPlayerId)
  const playingMembers = room?.members.filter(({ team }) => team !== 0) ?? []
  const ffaCapacity = room ? room.teamOneCapacity + room.teamTwoCapacity : 16
  const teamOnePlayingCount = room?.members.filter(({ team }) => team === 1).length ?? 0
  const teamTwoPlayingCount = room?.members.filter(({ team }) => team === 2).length ?? 0
  const canBlockFfa = Boolean(
    room &&
    (room.teamOneCapacity > Math.max(1, teamOnePlayingCount) ||
      room.teamTwoCapacity > Math.max(1, teamTwoPlayingCount))
  )
  const canUnblockFfa = Boolean(room && (room.teamOneCapacity < 8 || room.teamTwoCapacity < 8))

  const showMemberMenu = (event: MouseEvent<HTMLElement>, member: CustomGameMember): void => {
    if (!owner || member.id === currentPlayerId) return
    event.preventDefault()
    setMemberMenu({
      member,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 184)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 104))
    })
  }

  const moveSelf = async (team: 0 | 1 | 2): Promise<void> => {
    if (!room || room.state !== 'WAITING' || currentMember?.team === team || movingToTeam !== null)
      return
    setMovingToTeam(team)
    await moveMember(currentPlayerId, team)
    window.setTimeout(() => setMovingToTeam(null), 320)
  }

  const moveSelfToFfa = (): void => {
    if (!room || currentMember?.team !== 0) return
    const teamOneCount = room.members.filter(({ team }) => team === 1).length
    const teamTwoCount = room.members.filter(({ team }) => team === 2).length
    const targetTeam =
      teamOneCount >= room.teamOneCapacity
        ? 2
        : teamTwoCount >= room.teamTwoCapacity || teamOneCount <= teamTwoCount
          ? 1
          : 2
    void moveSelf(targetTeam)
  }

  const changeFfaCapacity = (change: -1 | 1): void => {
    if (!room || room.mode !== 'ffa' || room.state !== 'WAITING') return
    if (change === 1) {
      const team =
        room.teamOneCapacity < 8 &&
        (room.teamOneCapacity <= room.teamTwoCapacity || room.teamTwoCapacity >= 8)
          ? 1
          : 2
      void setTeamCapacity(team, (team === 1 ? room.teamOneCapacity : room.teamTwoCapacity) + 1)
      return
    }
    const teamOneSpare = room.teamOneCapacity - Math.max(1, teamOnePlayingCount)
    const teamTwoSpare = room.teamTwoCapacity - Math.max(1, teamTwoPlayingCount)
    const team = teamOneSpare >= teamTwoSpare && teamOneSpare > 0 ? 1 : 2
    if ((team === 1 ? teamOneSpare : teamTwoSpare) <= 0) return
    void setTeamCapacity(team, (team === 1 ? room.teamOneCapacity : room.teamTwoCapacity) - 1)
  }

  const addFriend = (member: CustomGameMember): void => {
    setMemberMenu(null)
    void requestFriend(member.id).then(() => {
      const { error: friendError, notice } = useFriendsStore.getState()
      if (friendError) toast.error(friendError)
      else if (notice) toast.success(notice)
    })
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col pt-5">
      {!room && (
        <div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-200 uppercase">
              Custom games
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              Up to 16 players, two spectators, drop-in play, and owner-blocked team slots.
            </p>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {room ? (
        <div className="border border-white/15 bg-neutral-950/75 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">{room.name}</h3>
              <p className="mt-1 text-xs tracking-wide text-neutral-400 uppercase">
                {room.region} ·{' '}
                {room.mode === 'ffa'
                  ? 'FFA · first to 90'
                  : room.teamOneCapacity === room.teamTwoCapacity
                    ? `Unranked ${room.teamOneCapacity}v${room.teamTwoCapacity}`
                    : 'Unranked custom'}{' '}
                · {room.state.replace('_', ' ')}
              </p>
            </div>
            <div className="flex gap-2">
              {owner && room.state === 'WAITING' && (
                <Button disabled={disabled} onClick={() => void startRoom()}>
                  Start ready check
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={owner && room.state !== 'WAITING'}
                onClick={() => void leaveRoom()}
              >
                Leave
              </Button>
            </div>
          </div>

          {editable && nodes.some((node) => node.available && node.id !== room.hostNodeId) && (
            <form
              className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                const targetNodeId = String(new FormData(event.currentTarget).get('targetNodeId'))
                void moveServer(targetNodeId).then((moved) => {
                  if (moved) void selectNode(targetNodeId)
                })
              }}
            >
              <span className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                Move room
              </span>
              <select className={fieldClass} name="targetNodeId">
                {nodes
                  .filter((node) => node.available && node.id !== room.hostNodeId)
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.region} · {node.id}
                    </option>
                  ))}
              </select>
              <Button variant="secondary" type="submit">
                Move to server
              </Button>
            </form>
          )}

          {editable && (
            <form
              key={`${room.id}:${room.name}:${room.mode}:${room.mapId}:${room.hasPassword}`}
              className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-[1.2fr_.7fr_.9fr_1.2fr_auto] md:items-end"
              onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                const nextPassword = String(form.get('password') ?? '')
                void updateRoom({
                  name: String(form.get('name') ?? ''),
                  mode: String(form.get('mode') ?? 'unrated') as CustomGameMode,
                  mapId: String(form.get('mapId') ?? ''),
                  ...(nextPassword ? { password: nextPassword } : {})
                })
              }}
            >
              <label className="grid gap-1 text-[10px] font-bold tracking-wide text-neutral-500 uppercase">
                Room title
                <input className={fieldClass} name="name" defaultValue={room.name} maxLength={48} />
              </label>
              <label className="grid gap-1 text-[10px] font-bold tracking-wide text-neutral-500 uppercase">
                Mode
                <select className={fieldClass} name="mode" defaultValue={room.mode}>
                  <option value="unrated">Unranked</option>
                  <option value="ffa">FFA</option>
                </select>
              </label>
              <label className="grid gap-1 text-[10px] font-bold tracking-wide text-neutral-500 uppercase">
                Map
                <select className={fieldClass} name="mapId" defaultValue={room.mapId}>
                  {supportedMaps.map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[10px] font-bold tracking-wide text-neutral-500 uppercase">
                Password
                <input
                  className={fieldClass}
                  name="password"
                  maxLength={64}
                  type="password"
                  placeholder={room.hasPassword ? 'Replace password' : 'Optional password'}
                />
              </label>
              <Button variant="secondary" type="submit">
                Save
              </Button>
            </form>
          )}

          {room.state === 'READY_CHECK' && (
            <p className="mt-4 border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              Ready check is active. The server starts after every human player accepts.
            </p>
          )}

          {room.mode === 'ffa' ? (
            <div className="mt-5 border border-white/10">
              <p className="border-b border-white/10 px-3 py-2 text-xs font-bold tracking-widest text-neutral-300 uppercase">
                Players · {playingMembers.length}/{ffaCapacity} · {16 - ffaCapacity} blocked
              </p>
              <div className="grid md:grid-cols-2">
                {Array.from({ length: 16 }, (_, index) => {
                  const member = playingMembers[index]
                  const blocked = index >= ffaCapacity
                  const canMoveHere =
                    room.state === 'WAITING' && !member && !blocked && currentMember?.team === 0
                  return (
                    <div
                      key={index}
                      className={`relative flex h-10 items-center justify-between overflow-hidden border-b border-white/10 px-3 text-sm transition-colors md:odd:border-r ${canMoveHere ? 'cursor-pointer hover:bg-sky-400/8' : ''} ${blocked ? 'bg-black/35' : ''}`}
                      title={canMoveHere ? 'Double-click to join the game' : undefined}
                      onDoubleClick={canMoveHere ? moveSelfToFfa : undefined}
                      onContextMenu={member ? (event) => showMemberMenu(event, member) : undefined}
                    >
                      {member ? (
                        <span className="flex min-w-0 items-center gap-2 text-white">
                          <PlayerAvatar
                            username={member.username}
                            isBot={member.isBot}
                            className="size-7"
                          />
                          <span className="truncate">{member.isBot ? 'BOT' : member.username}</span>
                        </span>
                      ) : (
                        <span className="text-neutral-600">
                          {blocked ? 'Blocked' : 'Open player slot'}
                        </span>
                      )}
                      {blocked && (
                        <span className="pointer-events-none absolute inset-0" aria-hidden="true">
                          <span className="absolute top-1/2 left-1/2 h-px w-[110%] -translate-x-1/2 -translate-y-1/2 rotate-[4deg] bg-neutral-500/45" />
                          <span className="absolute top-1/2 left-1/2 h-px w-[110%] -translate-x-1/2 -translate-y-1/2 -rotate-[4deg] bg-neutral-500/45" />
                        </span>
                      )}
                      {editable && !member && (
                        <div className="relative z-10 ml-auto flex items-center gap-2">
                          {!blocked && (
                            <button
                              type="button"
                              className="grid size-7 place-items-center text-neutral-500 transition hover:bg-white/10 hover:text-sky-300"
                              aria-label="Add bot"
                              title="Add bot"
                              onClick={() => void addBot()}
                            >
                              <Bot className="size-4" aria-hidden="true" />
                            </button>
                          )}
                          {!blocked && index === ffaCapacity - 1 && canBlockFfa && (
                            <button
                              type="button"
                              className="text-xs font-semibold text-amber-300 hover:text-amber-200"
                              onClick={() => changeFfaCapacity(-1)}
                            >
                              Block
                            </button>
                          )}
                          {blocked && index === ffaCapacity && canUnblockFfa && (
                            <button
                              type="button"
                              className="text-xs font-semibold text-sky-300 hover:text-sky-200"
                              onClick={() => changeFfaCapacity(1)}
                            >
                              Unblock
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {([1, 2] as const).map((team) => (
                <div
                  key={team}
                  className={
                    movingToTeam === team
                      ? 'border border-sky-400/70 bg-sky-400/10 transition-colors duration-300'
                      : 'border border-white/10 transition-colors duration-300'
                  }
                >
                  <p className="border-b border-white/10 px-3 py-2 text-xs font-bold tracking-widest text-neutral-300 uppercase">
                    Team {team} · {room.members.filter((member) => member.team === team).length}/
                    {team === 1 ? room.teamOneCapacity : room.teamTwoCapacity} ·{' '}
                    {8 - (team === 1 ? room.teamOneCapacity : room.teamTwoCapacity)} blocked
                  </p>
                  <div className="divide-y divide-white/10">
                    {Array.from({ length: 8 }, (_, index) => {
                      const capacity = team === 1 ? room.teamOneCapacity : room.teamTwoCapacity
                      const member = room.members.filter((candidate) => candidate.team === team)[
                        index
                      ]
                      const blocked = index >= capacity
                      const canMoveHere =
                        room.state === 'WAITING' &&
                        !member &&
                        !blocked &&
                        currentMember?.team !== team
                      return (
                        <div
                          key={index}
                          className={`relative flex h-10 items-center justify-between overflow-hidden px-3 text-sm transition-colors ${canMoveHere ? 'cursor-pointer hover:bg-sky-400/8' : ''} ${blocked ? 'bg-black/35' : ''}`}
                          title={canMoveHere ? `Double-click to join Team ${team}` : undefined}
                          onDoubleClick={canMoveHere ? () => void moveSelf(team) : undefined}
                          onContextMenu={
                            member ? (event) => showMemberMenu(event, member) : undefined
                          }
                        >
                          {member ? (
                            <span className="flex min-w-0 items-center gap-2 text-white">
                              <PlayerAvatar
                                username={member.username}
                                isBot={member.isBot}
                                className="size-7"
                              />
                              <span className="truncate">
                                {member.isBot ? 'BOT' : member.username}
                              </span>
                            </span>
                          ) : (
                            <span className="text-neutral-600">
                              {blocked ? 'Blocked' : 'Open slot'}
                            </span>
                          )}
                          {blocked && (
                            <span
                              className="pointer-events-none absolute inset-0"
                              aria-hidden="true"
                            >
                              <span className="absolute top-1/2 left-1/2 h-px w-[110%] -translate-x-1/2 -translate-y-1/2 rotate-[4deg] bg-neutral-500/45" />
                              <span className="absolute top-1/2 left-1/2 h-px w-[110%] -translate-x-1/2 -translate-y-1/2 -rotate-[4deg] bg-neutral-500/45" />
                            </span>
                          )}
                          {editable && !member && (
                            <div className="relative z-10 ml-auto flex items-center gap-2">
                              {!blocked && (
                                <button
                                  type="button"
                                  className="grid size-7 place-items-center text-neutral-500 transition hover:bg-white/10 hover:text-sky-300"
                                  aria-label={`Add bot to Team ${team}`}
                                  title={`Add bot to Team ${team}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void addBot(team)
                                  }}
                                >
                                  <Bot className="size-4" aria-hidden="true" />
                                </button>
                              )}
                              {capacity > 1 && !blocked && index === capacity - 1 && (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-amber-300 hover:text-amber-200"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void setTeamCapacity(team, capacity - 1)
                                  }}
                                >
                                  Block
                                </button>
                              )}
                              {blocked && index === capacity && (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-sky-300 hover:text-sky-200"
                                  onClick={() => void setTeamCapacity(team, capacity + 1)}
                                >
                                  Unblock
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 border border-white/10">
            <p className="border-b border-white/10 px-3 py-2 text-xs font-bold tracking-widest text-neutral-300 uppercase">
              Spectators · {room.members.filter((member) => member.team === 0).length}/2
            </p>
            <div className="grid md:grid-cols-2 md:divide-x md:divide-white/10">
              {Array.from({ length: 2 }, (_, index) => {
                const member = room.members.filter((candidate) => candidate.team === 0)[index]
                const canMoveHere = room.state === 'WAITING' && !member && currentMember?.team !== 0
                return (
                  <div
                    key={index}
                    className={`flex h-10 items-center justify-between px-3 text-sm transition-colors ${canMoveHere ? 'cursor-pointer hover:bg-sky-400/8' : ''} ${movingToTeam === 0 ? 'bg-sky-400/10' : ''}`}
                    title={canMoveHere ? 'Double-click to spectate' : undefined}
                    onDoubleClick={canMoveHere ? () => void moveSelf(0) : undefined}
                    onContextMenu={member ? (event) => showMemberMenu(event, member) : undefined}
                  >
                    {member ? (
                      <span className="flex min-w-0 items-center gap-2 text-white">
                        <PlayerAvatar
                          username={member.username}
                          isBot={member.isBot}
                          className="size-7"
                        />
                        <span className="truncate">{member.isBot ? 'BOT' : member.username}</span>
                      </span>
                    ) : (
                      <span className="text-neutral-600">Open spectator slot</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-white/15 bg-neutral-950/85">
            <div className="flex items-center justify-between gap-3 border-b border-white/15 bg-white/5 px-4 py-2">
              <h3 className="text-sm font-bold tracking-wide text-white uppercase">
                {selectedNodeId === null ? 'Rooms across all servers' : 'Rooms on this server'}
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  className="h-8 gap-1.5 px-3 text-xs"
                  disabled={disabled}
                  onClick={openCreateModal}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Create room
                </Button>
                <Button
                  className="size-8 p-0"
                  variant="secondary"
                  disabled={status === 'loading'}
                  aria-label="Refresh rooms"
                  title="Refresh rooms"
                  onClick={() => void refresh()}
                >
                  <RefreshCw
                    className={`size-4 ${status === 'loading' ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                </Button>
              </div>
            </div>
            <div className="hidden grid-cols-[3rem_minmax(10rem,2fr)_6rem_7rem_minmax(8rem,1fr)_5rem_7rem_7rem] border-b border-white/10 bg-black/40 px-3 py-2 text-[10px] font-bold tracking-[0.12em] text-neutral-500 uppercase md:grid">
              <span>No.</span>
              <span>Room title</span>
              <span>Mode</span>
              <span>Map</span>
              <span>Server</span>
              <span>Players</span>
              <span>Status</span>
              <span />
            </div>
            <div className="min-h-0 flex-1 divide-y divide-white/10 overflow-y-auto">
              {rooms.length === 0 && (
                <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-neutral-300">No rooms found</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {selectedNodeId === null
                      ? 'Create the first room on any available server.'
                      : 'Create the first room on this server.'}
                  </p>
                </div>
              )}
              {rooms.map((candidate, index) => {
                const full =
                  candidate.members.length >=
                  candidate.teamOneCapacity + candidate.teamTwoCapacity + 2
                const unavailable = candidate.state === 'READY_CHECK' || full
                const mapName =
                  maps.find((map) => map.id === candidate.mapId)?.displayName ?? candidate.mapId
                const serverNode = nodes.find((node) => node.id === candidate.hostNodeId)
                const latencyMs = nodeLatency(serverNode)
                const serverLabel = `${regionLabel(candidate.region)} · ${candidate.hostNodeId}`
                return (
                  <div
                    key={candidate.id}
                    className="grid gap-3 px-4 py-3 transition hover:bg-white/5 md:grid-cols-[3rem_minmax(10rem,2fr)_6rem_7rem_minmax(8rem,1fr)_5rem_7rem_7rem] md:items-center md:px-3 md:py-2.5"
                  >
                    <span className="hidden font-mono text-xs text-neutral-500 md:block">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-white">
                        {candidate.hasPassword && (
                          <LockKeyhole
                            className="size-3.5 shrink-0 text-amber-300"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{candidate.name}</span>
                      </p>
                      <p className="mt-1 text-[10px] text-neutral-500 md:hidden">
                        {candidate.mode === 'ffa' ? 'FFA' : 'Unranked'} · {mapName} ·{' '}
                        {candidate.members.length}/
                        {candidate.teamOneCapacity + candidate.teamTwoCapacity + 2}
                      </p>
                      <p
                        className={`mt-1 truncate font-mono text-[10px] ${serverTextClass(latencyMs, serverNode?.available ?? false)}`}
                      >
                        {serverLabel} · {latencyMs === null ? 'No ping' : `${latencyMs} ms`}
                      </p>
                    </div>
                    <span className="hidden text-xs text-neutral-300 md:block">
                      {candidate.mode === 'ffa' ? 'FFA' : 'Unranked'}
                    </span>
                    <span className="hidden truncate font-mono text-xs text-neutral-300 md:block">
                      {mapName}
                    </span>
                    <span
                      className={`hidden truncate font-mono text-xs md:block ${serverTextClass(latencyMs, serverNode?.available ?? false)}`}
                      title={`${serverLabel} · ${latencyMs === null ? 'No ping' : `${latencyMs} ms`}`}
                    >
                      {serverLabel} · {latencyMs === null ? 'No ping' : `${latencyMs} ms`}
                    </span>
                    <span className="hidden font-mono text-xs text-neutral-300 md:block">
                      {candidate.members.length}/
                      {candidate.teamOneCapacity + candidate.teamTwoCapacity + 2}
                    </span>
                    <span
                      className={
                        candidate.state === 'LIVE'
                          ? 'text-xs font-semibold text-rose-300'
                          : candidate.state === 'READY_CHECK'
                            ? 'text-xs font-semibold text-amber-300'
                            : 'text-xs font-semibold text-emerald-300'
                      }
                    >
                      {candidate.state === 'LIVE'
                        ? 'In game'
                        : candidate.state === 'READY_CHECK'
                          ? 'Ready check'
                          : 'Waiting'}
                    </span>
                    <Button
                      className="h-8 px-3 text-xs"
                      variant="secondary"
                      disabled={unavailable}
                      onClick={() => {
                        if (candidate.hasPassword) setPasswordRoom(candidate)
                        else void joinRoom(candidate.id, undefined, candidate.hostApiUrl)
                      }}
                    >
                      {full ? 'Full' : candidate.state === 'LIVE' ? 'Join game' : 'Join'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {memberMenu && (
        <div
          role="menu"
          aria-label={`Room options for ${memberMenu.member.username}`}
          className="fixed z-[90] w-44 border border-white/15 bg-neutral-950 py-1 shadow-2xl"
          style={{ left: memberMenu.x, top: memberMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {!memberMenu.member.isBot && !friends.some(({ id }) => id === memberMenu.member.id) && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-white/10"
              onClick={() => addFriend(memberMenu.member)}
            >
              <UserPlus className="size-4 text-sky-300" aria-hidden="true" />
              Add friend
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
            onClick={() => {
              const playerId = memberMenu.member.id
              setMemberMenu(null)
              void kick(playerId)
            }}
          >
            <UserX className="size-4" aria-hidden="true" />
            Kick from room
          </button>
        </div>
      )}

      {createModalOpen && (
        <CreateCustomGameModal maps={maps} selectedNodeId={selectedNodeId} disabled={disabled} />
      )}
      {passwordRoom && (
        <JoinCustomGameModal room={passwordRoom} onClose={() => setPasswordRoom(null)} />
      )}
    </section>
  )
}
