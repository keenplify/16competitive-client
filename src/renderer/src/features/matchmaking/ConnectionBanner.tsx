import { LoaderCircle, WifiOff } from 'lucide-react'
import { useMatchmakingStore } from './matchmaking.store'

export function ConnectionBanner(): React.JSX.Element | null {
  const connectionStatus = useMatchmakingStore((state) => state.connectionStatus)

  if (connectionStatus !== 'reconnecting') return null

  return (
    <aside
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 border-b border-amber-300/30 bg-amber-950/95 px-4 py-2.5 text-sm font-medium text-amber-100 shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="size-4" aria-hidden="true" />
      <span>Disconnected from the server, reconnecting...</span>
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
    </aside>
  )
}
