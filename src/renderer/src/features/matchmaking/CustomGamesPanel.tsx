import { useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import {
  HelpCircle,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
  Settings,
  UserPlus,
  UserX
} from 'lucide-react'
import { toast } from 'react-toastify'
import { twMerge } from 'tailwind-merge'
import {
  CUSTOM_GAME_MODE_LABELS,
  type CustomGameMember,
  type CustomGameRoom
} from '../../../../shared/custom-games'
import type { MatchmakingMap } from '../../../../shared/matchmaking'
import type { MatchmakingNode } from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { FindMatchButton } from './FindMatchButton'
import { useDismissibleMenu } from '../../components/ui/use-dismissible-menu'
import { RoomRoster } from './RoomRoster'
import { localMapPreviews } from './map-previews'
import './room-lobby.css'
import { RoomSettingsModal } from './RoomSettingsModal'
import { WarningMarker } from '../../components/ui/WarningMarker'
import {
  formatLocalMinor,
  formatPCash,
  pcashToLocalMinor
} from '../../../../shared/community-currency'
import { useTranslation } from '../i18n/i18n'
import { customModeLabel, roomModeChoice } from './winter-ffa-label'
import { CreateCustomGameModal } from './CreateCustomGameModal'
import { JoinCustomGameModal } from './JoinCustomGameModal'
import { useCustomGamesStore } from './custom-games.store'
import { useMatchmakingStore } from './matchmaking.store'
import { useFriendsStore } from '../friends/friends.store'
import { usePaymentsStore } from '../skins/payments.store'
import { usePartnerBrandingStore } from '../partner-branding/partner-branding.store'

interface CustomGamesPanelProps {
  currentPlayerId: string
  maps: MatchmakingMap[]
  nodes: MatchmakingNode[]
  selectedNodeId: string | null
  disabled?: boolean
}

const regionLabel = (region: string): string => {
  if (region === 'sea') return 'SEA'
  if (region === 'sa') return 'South America'
  return region
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

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

/** Per-player bet share label plus the reusable short-balance marker. */
function MemberBetMarkers({
  member,
  currentPlayerId
}: {
  member: CustomGameMember
  currentPlayerId: string
}): JSX.Element | null {
  const betting = useCustomGamesStore((state) => state.betting)
  const ownBalance = usePaymentsStore((state) => state.snapshot?.pCash)
  const { t, language } = useTranslation()
  const share = member.betSharePCash ?? null
  if (share === null) return null
  const local = betting?.currency
    ? formatLocalMinor(
        pcashToLocalMinor(share, betting.currency.localPerPcashMicros),
        betting.currency.symbol,
        language
      )
    : null
  const amount = local ?? `${formatPCash(share, language)} PCash`
  const self = member.id === currentPlayerId
  const ownBalanceText =
    self && ownBalance !== undefined && betting?.currency
      ? formatLocalMinor(
          pcashToLocalMinor(ownBalance, betting.currency.localPerPcashMicros),
          betting.currency.symbol,
          language
        )
      : null
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      <span className="text-[11px] tabular-nums text-neutral-400">
        {t('customRoom.betShare', { amount })}
      </span>
      {member.betCovered === false && (
        <WarningMarker label={t('customRoom.betInsufficient')}>
          <span className="block max-w-64 text-xs leading-relaxed">
            {self && ownBalanceText
              ? t('customRoom.betShortTooltipSelf', { amount, balance: ownBalanceText })
              : t('customRoom.betShortTooltip', { amount })}
          </span>
        </WarningMarker>
      )}
    </span>
  )
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
  const refresh = useCustomGamesStore((state) => state.refresh)
  const createModalOpen = useCustomGamesStore((state) => state.createModalOpen)
  const openCreateModal = useCustomGamesStore((state) => state.openCreateModal)
  const { t } = useTranslation()
  const settingsModalOpen = useCustomGamesStore((state) => state.settingsModalOpen)
  const openRoomSettings = useCustomGamesStore((state) => state.openRoomSettings)
  const savingSettings = useCustomGamesStore((state) => state.savingSettings)
  const joinRoom = useCustomGamesStore((state) => state.joinRoom)
  const vip = usePartnerBrandingStore((state) => state.vip)
  const communityName = usePartnerBrandingStore((state) => state.branding?.communityName)
  const vipLocked = vip?.customGamesVipOnly === true && !vip.active
  const leaveRoom = useCustomGamesStore((state) => state.leaveRoom)
  const startRoom = useCustomGamesStore((state) => state.startRoom)
  const addBot = useCustomGamesStore((state) => state.addBot)
  const addingBot = useCustomGamesStore((state) => state.addingBot)
  const setTeamCapacity = useCustomGamesStore((state) => state.setTeamCapacity)
  const moveMember = useCustomGamesStore((state) => state.moveMember)
  const kick = useCustomGamesStore((state) => state.kick)
  const friends = useFriendsStore((state) => state.friends)
  const requestFriend = useFriendsStore((state) => state.request)
  const selectNode = useMatchmakingStore((state) => state.selectNode)
  const loadMaps = useMatchmakingStore((state) => state.loadMaps)
  const [passwordRoom, setPasswordRoom] = useState<CustomGameRoom | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const setChatDock = useCustomGamesStore((s) => s.setChatDock)
  const [memberMenu, setMemberMenu] = useState<{
    member: CustomGameMember
    x: number
    y: number
  } | null>(null)
  const memberMenuRef = useRef<HTMLDivElement>(null)
  useDismissibleMenu(Boolean(memberMenu), memberMenuRef, () => setMemberMenu(null))

  useLayoutEffect(() => {
    const menu = memberMenuRef.current
    if (!memberMenu || !menu) return
    menu.showPopover()
    menu.style.left =
      Math.max(4, Math.min(memberMenu.x, window.innerWidth - menu.offsetWidth - 4)) + 'px'
    menu.style.top =
      Math.max(4, Math.min(memberMenu.y, window.innerHeight - menu.offsetHeight - 4)) + 'px'
    menu.querySelector('button')?.focus({ preventScroll: true })
  }, [memberMenu])
  const busy = disabled || savingSettings || addingBot || actionPending
  const runAction = async (action: () => Promise<void>) => {
    if (busy) return
    setActionPending(true)
    const id = toast.loading(t('roomLobby.updating'))
    try {
      await action()
      const error = useCustomGamesStore.getState().error
      toast.update(id, {
        render: error ?? t('roomLobby.updated'),
        type: error ? 'error' : 'success',
        isLoading: false,
        autoClose: 3500
      })
    } catch (error) {
      toast.update(id, {
        render: error instanceof Error ? error.message : t('customGames.errorTitle'),
        type: 'error',
        isLoading: false,
        autoClose: 4000
      })
    } finally {
      setActionPending(false)
    }
  }

  useEffect(() => {
    void loadMaps()
  }, [loadMaps])

  useEffect(() => {
    void refresh()
    if (passwordRoom) return
    const timer = window.setInterval(() => void refresh(), 2_000)
    return () => window.clearInterval(timer)
  }, [passwordRoom, refresh, selectedNodeId])

  useEffect(() => {
    if (room && room.hostNodeId !== selectedNodeId) void selectNode(room.hostNodeId)
  }, [room, selectNode, selectedNodeId])

  const owner = room?.ownerId === currentPlayerId
  const editable = owner && room?.state === 'WAITING'
  const currentMember = room?.members.find(({ id }) => id === currentPlayerId)
  const playingMembers = room?.members.filter(({ team }) => team !== 0) ?? []
  const roomMode = room && roomModeChoice(room.mode, room.mapId)
  const ffaCapacity = room ? room.teamOneCapacity + room.teamTwoCapacity : 16
  const teamOnePlayingCount = room?.members.filter(({ team }) => team === 1).length ?? 0
  const teamTwoPlayingCount = room?.members.filter(({ team }) => team === 2).length ?? 0
  const canBlockFfa = Boolean(
    room &&
    (room.teamOneCapacity > Math.max(1, teamOnePlayingCount) ||
      room.teamTwoCapacity > Math.max(1, teamTwoPlayingCount))
  )
  const map = maps.find((m) => m.id === room?.mapId)
  const mapPreview = map?.previewUrl || (room && localMapPreviews[room.mapId])

  const showMemberMenu = (event: MouseEvent<HTMLElement>, member: CustomGameMember): void => {
    if (!owner || member.id === currentPlayerId) return
    event.preventDefault()
    setMemberMenu({
      member,
      x: event.clientX,
      y: event.clientY
    })
  }

  const moveSelfToFfa = async (): Promise<void> => {
    if (!room || currentMember?.team !== 0) return
    const teamOneCount = room.members.filter(({ team }) => team === 1).length
    const teamTwoCount = room.members.filter(({ team }) => team === 2).length
    const targetTeam =
      teamOneCount >= room.teamOneCapacity
        ? 2
        : teamTwoCount >= room.teamTwoCapacity || teamOneCount <= teamTwoCount
          ? 1
          : 2
    await moveMember(currentPlayerId, targetTeam)
  }

  const changeFfaCapacity = async (change: -1 | 1): Promise<void> => {
    if (!room || room.mode !== 'ffa' || room.state !== 'WAITING') return
    if (change === 1) {
      const team =
        room.teamOneCapacity < 8 &&
        (room.teamOneCapacity <= room.teamTwoCapacity || room.teamTwoCapacity >= 8)
          ? 1
          : 2
      await setTeamCapacity(team, (team === 1 ? room.teamOneCapacity : room.teamTwoCapacity) + 1)
      return
    }
    const teamOneSpare = room.teamOneCapacity - Math.max(1, teamOnePlayingCount)
    const teamTwoSpare = room.teamTwoCapacity - Math.max(1, teamTwoPlayingCount)
    const team = teamOneSpare >= teamTwoSpare && teamOneSpare > 0 ? 1 : 2
    if ((team === 1 ? teamOneSpare : teamTwoSpare) <= 0) return
    await setTeamCapacity(team, (team === 1 ? room.teamOneCapacity : room.teamTwoCapacity) - 1)
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

      {room ? (
        <div className="custom-room-board">
          <div className="room-main-grid">
            <aside className="room-map-card">
              {mapPreview && (
                <img
                  key={mapPreview}
                  src={mapPreview}
                  alt=""
                  onError={(e) => {
                    const fallback = localMapPreviews[room.mapId]
                    if (fallback && e.currentTarget.getAttribute('src') !== fallback)
                      e.currentTarget.src = fallback
                    else e.currentTarget.hidden = true
                  }}
                />
              )}
              <div className="room-map-caption">
                <span className="text-xs font-bold uppercase tracking-widest">
                  {t('customRoom.map')}
                </span>
                <h2 className="text-2xl font-bold">{map?.displayName ?? room.mapId}</h2>
                <p className="mt-2 text-sm">
                  {t(customModeLabel(roomMode ?? room.mode))} ·{' '}
                  {room.mode === 'ffa'
                    ? t('matchmaking.ffaKillTarget').replace(
                        '{kills}',
                        roomMode === 'winter_ffa' ? '30' : '50'
                      )
                    : `${room.teamOneCapacity}v${room.teamTwoCapacity}`}
                </p>
                <p className="mt-1 text-xs uppercase">
                  {room.region} ·{' '}
                  {t(
                    (
                      {
                        WAITING: 'roomLobby.waiting',
                        LIVE: 'roomLobby.live',
                        READY_CHECK: 'roomLobby.ready',
                        FINISHED: 'roomLobby.finished'
                      } as const
                    )[room.state]
                  )}
                </p>
                {room.state === 'READY_CHECK' && (
                  <p className="mt-2 text-sm text-amber-200">{t('roomLobby.readyHint')}</p>
                )}
              </div>
            </aside>
            {(room.mode === 'ffa' ? ([0] as const) : ([1, 2] as const)).map((team) => {
              const ffa = team === 0
              const members = ffa ? playingMembers : room.members.filter((m) => m.team === team)
              const capacity = ffa
                ? ffaCapacity
                : team === 1
                  ? room.teamOneCapacity
                  : room.teamTwoCapacity
              const resize = (change: -1 | 1) =>
                runAction(() =>
                  team === 0 ? changeFfaCapacity(change) : setTeamCapacity(team, capacity + change)
                )
              return (
                <div key={team} className={ffa ? 'room-ffa' : 'min-w-0'}>
                  <RoomRoster
                    title={ffa ? t('profile.players') : t('roomLobby.team', { n: team })}
                    tone={team === 2 ? 'red' : 'blue'}
                    host={room.ownerId}
                    members={members}
                    capacity={capacity}
                    maximum={ffa ? 16 : 8}
                    busy={busy}
                    canDecrease={ffa ? canBlockFfa : capacity > Math.max(1, members.length)}
                    onReset={
                      editable
                        ? () =>
                            void runAction(async () => {
                              for (const side of team === 0 ? ([1, 2] as const) : [team]) {
                                if (useCustomGamesStore.getState().currentRoom?.id !== room.id)
                                  return
                                if ((side === 1 ? room.teamOneCapacity : room.teamTwoCapacity) < 8)
                                  await setTeamCapacity(side, 8)
                                if (useCustomGamesStore.getState().error) return
                              }
                            })
                        : undefined
                    }
                    onDecrease={editable ? () => void resize(-1) : undefined}
                    onIncrease={editable ? () => void resize(1) : undefined}
                    onAddBot={
                      editable && roomMode !== 'winter_ffa'
                        ? () => void runAction(() => addBot(team || undefined))
                        : undefined
                    }
                    onJoin={
                      room.state === 'WAITING' &&
                      (ffa ? currentMember?.team === 0 : currentMember?.team !== team)
                        ? () =>
                            void runAction(() =>
                              team === 0 ? moveSelfToFfa() : moveMember(currentPlayerId, team)
                            )
                        : undefined
                    }
                    onMenu={showMemberMenu}
                    markers={(member) => (
                      <MemberBetMarkers member={member} currentPlayerId={currentPlayerId} />
                    )}
                  />
                </div>
              )
            })}
          </div>
          <div className="room-bottom-grid">
            <div className="room-chat-dock" ref={setChatDock} />
            <div className="flex min-w-0 flex-col gap-3">
              <RoomRoster
                title={t('roomLobby.spectators')}
                tone="spectators"
                members={room.members.filter((m) => m.team === 0)}
                capacity={2}
                maximum={2}
                host={room.ownerId}
                busy={busy}
                onMenu={showMemberMenu}
                onJoin={
                  room.state === 'WAITING' && currentMember?.team !== 0
                    ? () => void runAction(() => moveMember(currentPlayerId, 0))
                    : undefined
                }
              />
              <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
                {editable && (
                  <Button
                    variant="secondary"
                    className="size-10 p-2"
                    aria-label={t('customRoom.settings')}
                    title={t('customRoom.settings')}
                    aria-haspopup="dialog"
                    disabled={busy}
                    onClick={openRoomSettings}
                  >
                    <Settings size={18} />
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="h-10 px-4"
                  disabled={busy || (owner && !editable)}
                  onClick={() => void runAction(leaveRoom)}
                >
                  {t('roomLobby.leave')}
                </Button>
                {editable && (
                  <Button
                    className="room-start h-auto min-h-12 grow gap-2 px-5 py-3"
                    disabled={
                      busy ||
                      settingsModalOpen ||
                      (roomMode === 'winter_ffa' && playingMembers.length < 2)
                    }
                    onClick={() => void runAction(startRoom)}
                  >
                    <Play className="size-4 shrink-0 fill-current" aria-hidden="true" />
                    {t('customRoom.start')}
                  </Button>
                )}
              </div>
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
                <FindMatchButton
                  className="h-8 min-w-0 gap-1.5 px-3 text-xs font-semibold tracking-normal normal-case"
                  disabled={disabled}
                  onClick={openCreateModal}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="relative z-10">{t('customGames.create')}</span>
                </FindMatchButton>
                {vipLocked && (
                  <span
                    className="grid size-8 shrink-0 cursor-help place-items-center rounded-none border border-white/15 bg-black/40 text-neutral-300"
                    title={t('customRoom.vipCreateTooltip', {
                      community: communityName ?? 'community'
                    })}
                    aria-label={t('customRoom.vipCreateTooltip', {
                      community: communityName ?? 'community'
                    })}
                  >
                    <HelpCircle className="size-4" aria-hidden="true" />
                  </span>
                )}
                <Button
                  className="size-8 p-0"
                  variant="secondary"
                  disabled={status === 'loading'}
                  aria-label="Refresh rooms"
                  title="Refresh rooms"
                  onClick={() => {
                    void refresh()
                    void loadMaps()
                  }}
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
                const locked = candidate.joinRestricted === true
                const unavailable = candidate.state === 'READY_CHECK' || full || locked
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
                        {(candidate.hasPassword || locked) && (
                          <LockKeyhole
                            className={twMerge(
                              'size-3.5 shrink-0',
                              locked ? 'text-neutral-400' : 'text-amber-300'
                            )}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{candidate.name}</span>
                      </p>
                      <p className="mt-1 text-[10px] text-neutral-500 md:hidden">
                        {CUSTOM_GAME_MODE_LABELS[candidate.mode]} · {mapName} ·{' '}
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
                      {CUSTOM_GAME_MODE_LABELS[candidate.mode]}
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
                      className={twMerge(
                        'h-8 px-3 text-xs',
                        vipLocked ? 'cursor-not-allowed opacity-50' : ''
                      )}
                      variant="secondary"
                      disabled={!vipLocked && unavailable}
                      aria-disabled={vipLocked || unavailable}
                      title={locked ? t('customRoom.joinUnavailable') : undefined}
                      onClick={() => {
                        if (vipLocked) {
                          toast.error(
                            t('customRoom.vipJoinToast', {
                              community: communityName ?? 'community'
                            })
                          )
                          return
                        }
                        if (locked) return
                        if (candidate.hasPassword) setPasswordRoom(candidate)
                        else void joinRoom(candidate.id, undefined, candidate.hostApiUrl)
                      }}
                    >
                      {locked
                        ? t('customRoom.joinUnavailable')
                        : full
                          ? 'Full'
                          : candidate.state === 'LIVE'
                            ? 'Join game'
                            : 'Join'}
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
          ref={memberMenuRef}
          popover="manual"
          role="menu"
          aria-label={memberMenu.member.username}
          className="fixed inset-auto m-0 z-[90] w-44 text-white border border-white/15 bg-neutral-950 py-1 shadow-2xl"
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
              {t('profile.addFriend')}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
            onClick={() => {
              const playerId = memberMenu.member.id
              setMemberMenu(null)
              void runAction(() => kick(playerId))
            }}
          >
            <UserX className="size-4" aria-hidden="true" />
            {t('roomLobby.kick')}
          </button>
        </div>
      )}

      {editable && settingsModalOpen && room && (
        <RoomSettingsModal key={room.id} room={room} maps={maps} disabled={disabled} />
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
