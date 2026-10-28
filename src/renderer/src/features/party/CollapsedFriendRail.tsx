import type { JSX } from 'react'
import type { FriendPlayer } from '../../../../shared/friends'
import { Users } from 'lucide-react'
import { ProfileRankInsignia } from '../../components/ui/ProfileRankInsignia'

interface CollapsedFriendRailProps {
  collapsed: boolean
  communityOnly: boolean
  notificationCount: number
  friends: FriendPlayer[]
}

export function CollapsedFriendRail({
  collapsed,
  communityOnly,
  notificationCount,
  friends
}: CollapsedFriendRailProps): JSX.Element {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center transition-all duration-200 ${collapsed ? 'translate-x-0 opacity-100 delay-100' : 'pointer-events-none translate-x-3 opacity-0'}`}
      aria-hidden={!collapsed}
    >
      <div className="relative mt-5 shrink-0 p-2">
        <Users className="size-4" aria-hidden="true" />
        {notificationCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-black">
            {notificationCount}
          </span>
        )}
      </div>
      {!communityOnly && (
        <div className="mt-3 min-h-0 w-full flex-1 overflow-y-auto border-t border-white/10 py-2">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="relative grid h-10 w-full place-items-center hover:bg-white/10"
              title={friend.username}
            >
              <ProfileRankInsignia
                level={friend.level}
                title={friend.levelTitle}
                ariaLabel={friend.username}
                className="size-7"
              />
              {friend.presence !== 'OFFLINE' && (
                <span
                  className={`absolute right-1 bottom-1 size-1.5 rounded-full ${friend.presence === 'IN_GAME' ? 'bg-amber-300' : 'bg-emerald-300'}`}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="grid h-11 w-full shrink-0 place-items-center border-t border-white/10 text-neutral-400">
        <Users className="size-4" aria-hidden="true" />
      </div>
    </div>
  )
}
