import type { MouseEvent, ReactNode } from 'react'
import { Bot, Crown, LockKeyhole, Minus, Plus } from 'lucide-react'
import type { CustomGameMember } from '../../../../shared/custom-games'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { CustomGamePlayerRank } from './CustomGamePlayerRank'

interface RoomRosterProps {
  title: string
  tone: 'blue' | 'red' | 'spectators'
  members: CustomGameMember[]
  capacity: number
  maximum: number
  host: string
  busy: boolean
  onReset?: () => void
  onDecrease?: () => void
  onIncrease?: () => void
  onAddBot?: () => void
  canDecrease?: boolean
  onJoin?: () => void
  onMenu: (e: MouseEvent<HTMLElement>, member: CustomGameMember) => void
  markers?: (member: CustomGameMember) => ReactNode
}

export function RoomRoster({
  title,
  tone,
  members,
  capacity,
  maximum,
  host,
  busy,
  onReset,
  onDecrease,
  onIncrease,
  onAddBot,
  canDecrease,
  onJoin,
  onMenu,
  markers
}: RoomRosterProps) {
  const { t } = useTranslation()
  return (
    <section className="room-roster" data-tone={tone} aria-label={title}>
      <header className="room-roster-head flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div>
          <h3 className="flex items-baseline gap-2 font-bold">
            {title}
            <span className="text-xs font-medium tabular-nums">
              {members.length}/{capacity}
            </span>
          </h3>
          {onReset ? (
            <button
              type="button"
              className="mt-1 flex items-center gap-1 px-2 py-1 text-xs"
              disabled={busy || maximum === capacity}
              onClick={onReset}
              title={t('roomLobby.reset')}
              aria-label={t('roomLobby.reset')}
            >
              <LockKeyhole size={11} aria-hidden="true" />
              {t('roomLobby.blocked', { n: maximum - capacity })}
            </button>
          ) : (
            maximum > capacity && (
              <span className="flex items-center gap-1 text-xs">
                <LockKeyhole size={11} aria-hidden="true" />
                {t('roomLobby.blocked', { n: maximum - capacity })}
              </span>
            )
          )}
        </div>
        {onIncrease && (
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              className="size-8 p-2"
              aria-label={t('roomLobby.decrease')}
              title={t('roomLobby.decrease')}
              disabled={busy || !canDecrease}
              onClick={onDecrease}
            >
              <Minus size={16} />
            </Button>
            <Button
              variant="secondary"
              className="size-8 p-2"
              aria-label={t('roomLobby.increase')}
              title={t('roomLobby.increase')}
              disabled={busy || capacity >= maximum}
              onClick={onIncrease}
            >
              <Plus size={16} />
            </Button>
            {onAddBot && (
              <Button
                variant="secondary"
                className="ml-1 size-8 p-2"
                aria-label={t('roomLobby.bot')}
                title={t('roomLobby.bot')}
                disabled={busy || members.length >= capacity}
                onClick={onAddBot}
              >
                <span className="relative">
                  <Bot size={16} />
                  <Plus
                    aria-hidden="true"
                    className="absolute -bottom-1 -left-1 size-2.5 bg-slate-900 text-white"
                    strokeWidth={3}
                  />
                </span>
              </Button>
            )}
          </div>
        )}
      </header>
      <div className={maximum === 16 ? 'room-seats grid sm:grid-cols-2' : 'room-seats'}>
        {Array.from({ length: capacity }, (_, index) => {
          const member = members[index]
          return member ? (
            <div
              key={member.id}
              className="room-seat flex items-center gap-2 px-3"
              onContextMenu={(e) => onMenu(e, member)}
            >
              <CustomGamePlayerRank
                playerId={member.id}
                isBot={member.isBot}
                className="size-7 shrink-0"
              />
              <span className="truncate font-semibold">
                {member.isBot ? 'BOT' : member.username}
              </span>
              {member.id === host && (
                <span title={t('roomLobby.host')}>
                  <Crown className="size-3.5 text-amber-300" aria-label={t('roomLobby.host')} />
                </span>
              )}
              {markers?.(member)}
            </div>
          ) : (
            <div
              key={index}
              className="room-seat flex items-center px-3 text-neutral-400"
              onDoubleClick={busy ? undefined : onJoin}
            >
              {onJoin ? (
                <button
                  type="button"
                  disabled={busy}
                  className="room-join px-3 py-1 text-xs"
                  onClick={onJoin}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {t('roomLobby.join')}
                </button>
              ) : (
                t('roomLobby.open')
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
