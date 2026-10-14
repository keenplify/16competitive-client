import { useEffect, useId, type JSX } from 'react'
import { ChevronDown, ChevronRight, UserPlus } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useFriendsStore } from '../friends/friends.store'
import { useCommunityChatStore } from './community-chat.store'
import { useCommunityMembersStore } from './community-members.store'
import { useCommunityText } from './community-copy'
export function CommunityMembersSection({ className }: { className?: string }): JSX.Element | null {
  const text = useCommunityText(),
    communityId = useCommunityChatStore((s) => s.communityId),
    name = useCommunityChatStore((s) => s.name)
  const expanded = useCommunityMembersStore((s) => s.expanded),
    members = useCommunityMembersStore((s) => s.members),
    total = useCommunityMembersStore((s) => s.total),
    loading = useCommunityMembersStore((s) => s.loading),
    error = useCommunityMembersStore((s) => s.error),
    hasMore = useCommunityMembersStore((s) => s.hasMore),
    toggle = useCommunityMembersStore((s) => s.toggle),
    load = useCommunityMembersStore((s) => s.load)
  const friends = useFriendsStore((s) => s.friends),
    actingPlayerId = useFriendsStore((s) => s.actingPlayerId),
    request = useFriendsStore((s) => s.request)
  const id = useId()
  useEffect(() => {
    if (useCommunityMembersStore.getState().communityId !== communityId)
      useCommunityMembersStore.getState().clear()
  }, [communityId])
  if (!communityId) return null
  return (
    <section className={twMerge('border-t border-white/10 pt-2', className)}>
      <button
        type="button"
        className="flex h-10 w-full items-center gap-2 px-4 text-left text-xs font-semibold text-neutral-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={toggle}
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 truncate">{name || text('community')}</span>
        <span className="ml-auto shrink-0 text-neutral-400">
          {text('members')}
          {total > 0 ? ` · ${total}` : ''}
        </span>
      </button>
      {expanded && (
        <div id={id} className="h-64 overflow-y-auto">
          <p className="min-h-5 px-4 text-xs text-neutral-400" role={error ? 'alert' : undefined}>
            {error
              ? text('membersError')
              : loading
                ? text('loadingMembers')
                : members.length === 0
                  ? text('noMembers')
                  : ''}
          </p>
          {members.map((member) => {
            const added =
                member.relationship === 'FRIEND' ||
                friends.some((friend) => friend.id === member.id),
              requested = member.relationship === 'OUTGOING' || member.relationship === 'INCOMING'
            return (
              <div
                key={member.id}
                className="flex h-10 items-center gap-2 px-4 text-xs hover:bg-white/5"
              >
                <span className="min-w-0 flex-1 truncate text-neutral-200">{member.username}</span>
                <Button
                  variant="ghost"
                  className="size-8 shrink-0 p-0"
                  disabled={added || requested || actingPlayerId === member.id}
                  aria-label={text(
                    added ? 'alreadyFriend' : requested ? 'requested' : 'addFriend',
                    { player: member.username }
                  )}
                  title={text(added ? 'alreadyFriend' : requested ? 'requested' : 'addFriend', {
                    player: member.username
                  })}
                  onClick={() => void request(member.id).then(() => load())}
                >
                  <UserPlus className="size-4" aria-hidden="true" />
                </Button>
              </div>
            )
          })}
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
  )
}
