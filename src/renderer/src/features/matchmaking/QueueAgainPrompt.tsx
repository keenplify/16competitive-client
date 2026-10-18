import { LoaderCircle, RotateCcw } from 'lucide-react'
import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { useNavigationStore } from '../navigation/navigation.store'
import { usePartyStore } from '../party/party.store'
import { useCustomGamesStore } from './custom-games.store'
import { useMatchmakingStore } from './matchmaking.store'

export function QueueAgainPrompt({ className }: { className?: string }): JSX.Element | null {
  const { t } = useTranslation()
  const completed = useMatchmakingStore((state) => state.completedMatch)
  const status = useMatchmakingStore((state) => state.queueAgainStatus)
  const connected = useMatchmakingStore((state) => state.connectionStatus === 'ready')
  const queueAgain = useMatchmakingStore((state) => state.queueAgain)
  const dismiss = useMatchmakingStore((state) => state.dismissCompletedMatch)
  const playerId = useAuthStore((state) => state.session?.player.id)
  const party = usePartyStore((state) => state.party)
  const customRoom = useCustomGamesStore((state) => state.currentRoom)
  const setPlayView = useCustomGamesStore((state) => state.setPlayView)
  const navigate = useNavigationStore((state) => state.navigate)
  if (completed?.mode !== 'arena' || customRoom?.matchId === completed.matchId) return null
  const isLeader = !party || party.leaderId === playerId
  const pending = status === 'joining'
  const message =
    status === 'error'
      ? t('queueAgain.error')
      : !isLeader
        ? t('queueAgain.leader')
        : !connected
          ? t('queueAgain.offline')
          : pending
            ? t('queueAgain.pending')
            : t('queueAgain.description')

  const join = (): void => {
    void queueAgain().then((joined) => {
      if (!joined) return
      setPlayView('matchmaking')
      navigate('lobby')
    })
  }
  const decline = (): void => {
    dismiss()
    navigate('lobby')
  }
  const review = (): void => {
    dismiss()
    setPlayView('matchmaking')
    navigate('play')
  }
  return (
    <section
      className={twMerge(
        'relative z-10 mx-auto mt-8 max-w-6xl border-y border-white/15 py-6 text-left',
        className
      )}
      aria-labelledby="queue-again-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 id="queue-again-title" className="text-xl font-semibold text-white">
            {t('queueAgain.title')}
          </h2>
          <p
            className={twMerge(
              'mt-2 min-h-20 max-w-xl text-sm leading-5 text-neutral-300',
              status === 'error' && 'text-rose-300'
            )}
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-56">
          <Button
            className="min-w-48 gap-2 rounded-none"
            disabled={pending || !connected || !isLeader}
            aria-busy={pending}
            onClick={join}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="size-4" aria-hidden="true" />
            )}
            {t('queueAgain.accept')}
          </Button>
          <Button
            variant="ghost"
            className="min-w-48 rounded-none"
            disabled={pending}
            onClick={status === 'error' ? review : decline}
          >
            {status === 'error' ? t('queueAgain.review') : t('queueAgain.decline')}
          </Button>
        </div>
      </div>
    </section>
  )
}
