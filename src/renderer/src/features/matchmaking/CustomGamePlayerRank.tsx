import { useEffect, type JSX } from 'react'
import { Bot, CircleHelp } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { ProfileRankInsignia } from '../../components/ui/ProfileRankInsignia'
import { useAuthStore } from '../auth/auth.store'
import { useFriendsStore } from '../friends/friends.store'
import { useProfileStore } from '../profile/profile.store'
import { useTranslation } from '../i18n/i18n'

interface CustomGamePlayerRankProps {
  playerId: string
  isBot: boolean
  className?: string
}

/** Display server-provided ranks; never infer them from a room member's MMR. */
export function CustomGamePlayerRank({
  playerId,
  isBot,
  className
}: CustomGamePlayerRankProps): JSX.Element {
  const { t } = useTranslation()
  const own = useAuthStore((state) =>
    state.session?.player.id === playerId ? state.session.player : null
  )
  const friend = useFriendsStore((state) => state.friends.find((entry) => entry.id === playerId))
  const profile = useProfileStore((state) => state.entries[playerId]?.profile)
  const load = useProfileStore((state) => state.load)
  const source = profile?.id === playerId ? profile : (own ?? friend)
  const level = source?.level
  const rankTitle = source?.levelTitle
  const hasRank =
    Number.isInteger(level) &&
    Number(level) >= 1 &&
    Number(level) <= 40 &&
    typeof rankTitle === 'string'

  useEffect(() => {
    // The profile store also serves overlays. Reuse existing requests/results,
    // and do not refetch on every custom-room status poll or team move.
    if (!isBot && !hasRank && !useProfileStore.getState().entries[playerId]) {
      void load(playerId)
    }
  }, [isBot, hasRank, load, playerId])

  const label = hasRank
    ? t('match.ready.rank', { level: Number(level), title: rankTitle ?? '' })
    : t('match.ready.rankUnavailable')

  return (
    <span
      className={twMerge('grid size-7 shrink-0 place-items-center', className)}
      title={isBot ? undefined : label}
    >
      {isBot ? (
        <Bot className="size-4 text-neutral-300" aria-hidden="true" />
      ) : hasRank ? (
        <ProfileRankInsignia
          level={Number(level)}
          title={rankTitle ?? ''}
          ariaLabel={label}
          className="size-full"
        />
      ) : (
        <CircleHelp className="size-4 text-neutral-400" role="img" aria-label={label} />
      )}
    </span>
  )
}
