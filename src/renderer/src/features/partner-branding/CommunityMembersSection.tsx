import { useProfileStore } from '../profile/profile.store'
import { useTranslation } from '../i18n/i18n'
import { useCommunitiesStore } from '../communities/communities.store'
import { useDisplayedCommunity } from '../communities/use-displayed-community'
import { useAuthStore } from '../auth/auth.store'
import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useRef, useState, type JSX } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  MoreVertical,
  UserGroup,
  UserRound,
  UserRoundCheck,
  UserRoundPlus,
  UserRoundX
} from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useDismissibleMenu } from '../../components/ui/use-dismissible-menu'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useFriendsStore } from '../friends/friends.store'
import { useCommunityChatStore } from './community-chat.store'
import { createCommunityMembersStore, useCommunityMembersStore } from './community-members.store'
import { useCommunityText } from './community-copy'
import type { CommunityMembers } from '../../../../shared/partner-community'
export function CommunityMembersSection({
  className,
  standalone = false
}: {
  className?: string
  standalone?: boolean
}): JSX.Element | null {
  const { t } = useTranslation()
  const current = useCommunitiesStore((state) => state.currentCommunity)
  const displayed = useDisplayedCommunity()
  const accountId = useAuthStore((state) => state.session?.player.id)
  const [menu, setMenu] = useState<{
    member: CommunityMembers['members'][number]
    communityId: string | null
    x: number
    y: number
  } | null>(null)
  const [kickPending, setKickPending] = useState<{
    id: string
    username: string
    communityId: string
  } | null>(null)
  const [kicking, setKicking] = useState(false)
  const [kickError, setKickError] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismissibleMenu(Boolean(menu), menuRef, () => setMenu(null))
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [menu])
  const text = useCommunityText(),
    chatCommunityId = useCommunityChatStore((s) => s.communityId),
    chatName = useCommunityChatStore((s) => s.name)
  const communityId = standalone ? (displayed?.id ?? null) : chatCommunityId
  const name = standalone ? displayed?.name : chatName
  const useMembers = useMemo(
    () =>
      standalone
        ? createCommunityMembersStore(communityId ?? undefined, accountId)
        : useCommunityMembersStore,
    [standalone, communityId, accountId]
  )
  const storedExpanded = useMembers((s) => s.expanded),
    memberCommunityId = useMembers((s) => s.communityId),
    storedMembers = useMembers((s) => s.members),
    total = useMembers((s) => s.total),
    loading = useMembers((s) => s.loading),
    error = useMembers((s) => s.error),
    hasMore = useMembers((s) => s.hasMore),
    canKick = useMembers((s) => s.canKick),
    page = useMembers((s) => s.page),
    toggle = useMembers((s) => s.toggle),
    load = useMembers((s) => s.load)
  const members = memberCommunityId === communityId ? storedMembers : []
  const mayKick = memberCommunityId === communityId && canKick
  const friends = useFriendsStore((s) => s.friends),
    actingPlayerId = useFriendsStore((s) => s.actingPlayerId),
    request = useFriendsStore((s) => s.request)
  const expanded = standalone || storedExpanded
  const memberCount =
    standalone && displayed?.memberCount != null
      ? displayed.memberCount
      : current?.id === communityId && current.memberCount !== null
        ? current.memberCount
        : page > 0 && memberCommunityId === communityId
          ? total
          : '—'
  const menuIsFriend = Boolean(
    menu &&
    (menu.member.relationship === 'FRIEND' ||
      friends.some((friend) => friend.id === menu.member.id))
  )
  const friendAction = menuIsFriend
    ? 'alreadyFriend'
    : menu?.member.relationship === 'OUTGOING'
      ? 'requested'
      : menu?.member.relationship === 'INCOMING'
        ? 'received'
        : 'addFriend'
  const FriendActionIcon = menuIsFriend
    ? UserRoundCheck
    : menu?.member.relationship === 'NONE'
      ? UserRoundPlus
      : Clock3
  const id = useId()
  useEffect(() => {
    if (useMembers.getState().communityId !== communityId) useMembers.getState().clear()
    if (standalone && communityId) void load()
    const timer =
      standalone && communityId
        ? window.setInterval(() => {
            if (!document.hidden) void load()
          }, 20000)
        : null
    return () => {
      if (timer) window.clearInterval(timer)
    }
  }, [communityId, standalone, load, useMembers])
  if (!communityId)
    return standalone ? (
      <p className="p-4 text-sm text-neutral-400">{t('community.noMembership')}</p>
    ) : null
  return (
    <>
      <section
        className={twMerge(
          'community-members-list',
          standalone ? 'flex h-full min-h-0 flex-col pt-2' : 'border-t border-white/10 pt-2',
          className
        )}
      >
        <button
          type="button"
          className="flex h-10 w-full items-center gap-2 px-4 text-left text-xs font-semibold text-neutral-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={standalone ? undefined : toggle}
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 truncate">{name || text('community')}</span>
          <span
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-neutral-400"
            aria-label={t('directory.memberCount', { count: String(memberCount) })}
            title={t('directory.memberCount', { count: String(memberCount) })}
          >
            <UserGroup className="size-4" aria-hidden="true" />
            <span aria-hidden="true">{memberCount}</span>
          </span>
        </button>
        {expanded && (
          <div
            id={id}
            className={standalone ? 'min-h-0 flex-1 overflow-y-auto' : 'h-64 overflow-y-auto'}
          >
            <p className="min-h-5 px-4 text-xs text-neutral-400" role={error ? 'alert' : undefined}>
              {error
                ? text('membersError')
                : loading
                  ? text('loadingMembers')
                  : members.length === 0
                    ? text('noMembers')
                    : ''}
            </p>
            {members.map((member) => (
              <div
                key={member.id}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ member, communityId, x: event.clientX, y: event.clientY })
                }}
                className="flex h-10 items-center gap-2 px-4 text-xs hover:bg-white/5"
              >
                <button
                  type="button"
                  className="community-member-name min-w-0 flex-1 truncate text-left text-neutral-200 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => useProfileStore.getState().open(member.id)}
                >
                  {member.username}
                </button>
                <button
                  type="button"
                  className="community-member-actions grid size-8 place-items-center text-neutral-400 hover:text-white"
                  aria-label={t('directory.memberActions', { player: member.username })}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect()
                    setMenu({ member, communityId, x: bounds.left, y: bounds.bottom })
                  }}
                >
                  <MoreVertical className="size-4" />
                </button>
              </div>
            ))}
            {(hasMore || error) && (
              <Button
                variant="ghost"
                disabled={loading}
                className="h-9 w-full text-xs"
                onClick={() => void load(hasMore && !error)}
              >
                {text(error ? 'refresh' : 'moreMembers')}
              </Button>
            )}
          </div>
        )}
      </section>
      {menu &&
        menu.communityId === communityId &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t('directory.memberActions', { player: menu.member.username })}
            className="fixed z-[110] min-w-48 border border-white/15 bg-neutral-900 p-1 text-white shadow-xl"
            style={{
              left: Math.max(8, Math.min(menu.x, window.innerWidth - 200)),
              top: Math.max(8, Math.min(menu.y, window.innerHeight - 110))
            }}
          >
            <button
              role="menuitem"
              type="button"
              className="flex h-10 w-full items-center gap-3 px-3 text-left text-sm hover:bg-white/10 focus:bg-white/10"
              onClick={() => {
                useProfileStore.getState().open(menu.member.id)
                setMenu(null)
              }}
            >
              <UserRound className="size-4 shrink-0 text-sky-300" aria-hidden="true" />
              {t('profile.view')}
            </button>
            <button
              role="menuitem"
              type="button"
              className="flex h-10 w-full items-center gap-3 px-3 text-left text-sm whitespace-nowrap hover:bg-white/10 focus:bg-white/10 disabled:text-neutral-400"
              disabled={
                menu.member.relationship !== 'NONE' ||
                menuIsFriend ||
                menu.member.id === accountId ||
                actingPlayerId === menu.member.id
              }
              onClick={() => {
                void request(menu.member.id).then(() => load())
                setMenu(null)
              }}
            >
              <FriendActionIcon className="size-4 shrink-0" aria-hidden="true" />
              {text(friendAction)}
            </button>
            {mayKick && menu.member.id !== communityId && menu.member.id !== accountId && (
              <button
                role="menuitem"
                type="button"
                className="flex h-10 w-full items-center gap-3 px-3 text-left text-sm text-rose-300 hover:bg-white/10 focus:bg-white/10"
                onClick={() => {
                  setKickPending({
                    id: menu.member.id,
                    username: menu.member.username,
                    communityId
                  })
                  setKickError(false)
                  setMenu(null)
                }}
              >
                <UserRoundX className="size-4 shrink-0" aria-hidden="true" />
                {t('directory.kickMember')}
              </button>
            )}
          </div>,
          document.body
        )}
      {kickPending && (
        <ModalDialog
          open
          onClose={() => {
            if (!kicking) setKickPending(null)
          }}
          label={t('directory.kickTitle', { player: kickPending.username })}
          labelledBy="community-kick-title"
          className="m-auto w-[min(28rem,calc(100vw-2rem))] border border-white/20 bg-neutral-950 p-6 text-white backdrop:bg-black/80"
        >
          <h2 id="community-kick-title" className="text-xl font-semibold">
            {t('directory.kickTitle', { player: kickPending.username })}
          </h2>
          <p className="mt-3 text-sm text-neutral-300">{t('directory.kickDescription')}</p>
          <p className="mt-3 min-h-5 text-sm text-rose-300" role={kickError ? 'alert' : 'status'}>
            {kickError ? t('directory.kickError') : ''}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={kicking}
              onClick={() => setKickPending(null)}
            >
              {t('directory.cancel')}
            </Button>
            <Button
              className="flex-1"
              disabled={kicking}
              onClick={() => {
                setKicking(true)
                void window.api.communityChat
                  .kickMember(kickPending.communityId, kickPending.id)
                  .then(() => {
                    setKickPending(null)
                    void load()
                  })
                  .catch(() => setKickError(true))
                  .finally(() => setKicking(false))
              }}
            >
              {t('directory.kickMember')}
            </Button>
          </div>
        </ModalDialog>
      )}
    </>
  )
}
