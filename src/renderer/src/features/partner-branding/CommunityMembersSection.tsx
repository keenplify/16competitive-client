import { useProfileStore } from '../profile/profile.store'
import { useTranslation } from '../i18n/i18n'
import { useCommunitiesStore } from '../communities/communities.store'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState, type JSX } from 'react'
import { ChevronDown, ChevronRight, MoreVertical, Users } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useFriendsStore } from '../friends/friends.store'
import { useCommunityChatStore } from './community-chat.store'
import { useCommunityMembersStore } from './community-members.store'
import { useCommunityText } from './community-copy'
export function CommunityMembersSection({
  className,
  standalone = false
}: {
  className?: string
  standalone?: boolean
}): JSX.Element | null {
  const { t } = useTranslation()
  const current = useCommunitiesStore((state) => state.currentCommunity)
  const [menu, setMenu] = useState<{
    member: { id: string; username: string; relationship: string }
    x: number
    y: number
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const close = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', close)
    }
  }, [menu])
  const text = useCommunityText(),
    chatCommunityId = useCommunityChatStore((s) => s.communityId),
    chatName = useCommunityChatStore((s) => s.name)
  const communityId = standalone ? (current?.id ?? null) : chatCommunityId
  const name = standalone ? current?.name : chatName
  const storedExpanded = useCommunityMembersStore((s) => s.expanded),
    members = useCommunityMembersStore((s) => s.members),
    total = useCommunityMembersStore((s) => s.total),
    loading = useCommunityMembersStore((s) => s.loading),
    error = useCommunityMembersStore((s) => s.error),
    hasMore = useCommunityMembersStore((s) => s.hasMore),
    page = useCommunityMembersStore((s) => s.page),
    toggle = useCommunityMembersStore((s) => s.toggle),
    load = useCommunityMembersStore((s) => s.load)
  const friends = useFriendsStore((s) => s.friends),
    actingPlayerId = useFriendsStore((s) => s.actingPlayerId),
    request = useFriendsStore((s) => s.request)
  const expanded = standalone || storedExpanded
  const memberCount =
    current?.id === communityId && current.memberCount !== null
      ? current.memberCount
      : page > 0
        ? total + 1
        : '—'
  const id = useId()
  useEffect(() => {
    if (useCommunityMembersStore.getState().communityId !== communityId)
      useCommunityMembersStore.getState().clear()
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
  }, [communityId, standalone, load])
  if (!communityId)
    return standalone ? (
      <p className="p-4 text-sm text-neutral-400">{t('community.noMembership')}</p>
    ) : null
  return (
    <>
      <section
        className={twMerge(
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
            <Users className="size-4" aria-hidden="true" />
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
                  setMenu({ member, x: event.clientX, y: event.clientY })
                }}
                className="flex h-10 items-center gap-2 px-4 text-xs hover:bg-white/5"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-neutral-200 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => useProfileStore.getState().open(member.id)}
                >
                  {member.username}
                </button>
                <button
                  type="button"
                  className="grid size-8 place-items-center text-neutral-400 hover:text-white"
                  aria-label={t('directory.memberActions', { player: member.username })}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect()
                    setMenu({ member, x: bounds.left, y: bounds.bottom })
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
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t('directory.memberActions', { player: menu.member.username })}
            className="fixed z-[110] min-w-44 border border-white/15 bg-neutral-900 p-1 text-white shadow-xl"
            style={{
              left: Math.max(8, Math.min(menu.x, window.innerWidth - 200)),
              top: Math.max(8, Math.min(menu.y, window.innerHeight - 110))
            }}
          >
            <button
              role="menuitem"
              type="button"
              className="block h-10 w-full px-3 text-left text-sm hover:bg-white/10 focus:bg-white/10"
              onClick={() => {
                useProfileStore.getState().open(menu.member.id)
                setMenu(null)
              }}
            >
              {t('profile.view')}
            </button>
            <button
              role="menuitem"
              type="button"
              className="block h-10 w-full px-3 text-left text-sm hover:bg-white/10 focus:bg-white/10 disabled:text-neutral-500"
              disabled={
                menu.member.relationship !== 'NONE' ||
                friends.some((friend) => friend.id === menu.member.id) ||
                actingPlayerId === menu.member.id
              }
              onClick={() => {
                void request(menu.member.id).then(() => load())
                setMenu(null)
              }}
            >
              {text(
                menu.member.relationship === 'FRIEND' ||
                  friends.some((friend) => friend.id === menu.member.id)
                  ? 'alreadyFriend'
                  : menu.member.relationship === 'NONE'
                    ? 'addFriend'
                    : 'requested',
                { player: menu.member.username }
              )}
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
