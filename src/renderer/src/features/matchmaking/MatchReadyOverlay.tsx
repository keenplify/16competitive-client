import { ModalDialog } from '../../components/ui/ModalDialog'
import { useEffect, useState, type JSX } from 'react'
import { MatchFoundReadyCheck } from './MatchFoundReadyCheck'
import { useMatchmakingStore } from './matchmaking.store'
import { useQueueWarmupStore } from './queue-warmup.store'
import './match-ready.css'

export function MatchReadyOverlay(): JSX.Element | null {
  const match = useMatchmakingStore((state) => state.match)
  const status = useMatchmakingStore((state) => state.queueStatus)
  const deadline = useMatchmakingStore((state) => state.readyDeadline)
  const declineAvailableAt = useMatchmakingStore((state) => state.readyDeclineAvailableAt)
  const accepted = useMatchmakingStore((state) => state.acceptedPlayerIds)
  const required = useMatchmakingStore((state) => state.readyPlayersRequired)
  const response = useMatchmakingStore((state) => state.readyResponse)
  const error = useMatchmakingStore((state) => state.error)
  const respond = useMatchmakingStore((state) => state.respondReady)
  const playingMr8 = useQueueWarmupStore(
    (state) => state.matchId !== null && state.mode === '5v5' && state.status === 'playing'
  )
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  if (!match) return null
  return (
    <>
      <ModalDialog
        open
        vguiTitlebar={false}
        onClose={() => {}}
        className="match-ready-dialog m-auto max-h-[calc(100dvh-2rem)] w-[min(46rem,calc(100vw-2rem))] max-w-none overflow-y-auto border-0 bg-transparent p-1 outline-none"
        labelledBy="match-ready-title"
      >
        <MatchFoundReadyCheck
          match={match}
          playingMr8={playingMr8}
          acceptedPlayerIds={accepted}
          playersRequired={required}
          readyResponse={response}
          secondsRemaining={
            deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : 0
          }
          canDeclineAfterAccept={
            declineAvailableAt !== null && Date.parse(declineAvailableAt) <= now
          }
          responseError={Boolean(error)}
          preparing={status === 'match_found'}
          onAccept={() => void respond(true)}
          onDecline={() => void respond(false)}
        />
      </ModalDialog>
    </>
  )
}
