import type { JSX } from 'react'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { MatchTerminationScreen } from './MatchTerminationScreen'

export function AntiCheatMatchCancellationNotice(): JSX.Element | null {
  const notice = useMatchmakingStore((state) => state.antiCheatTermination)
  const dismiss = useMatchmakingStore((state) => state.dismissAntiCheatTermination)
  if (!notice || notice.dismissed) return null
  return (
    <>
      <MatchTerminationScreen onContinue={dismiss} />
    </>
  )
}
