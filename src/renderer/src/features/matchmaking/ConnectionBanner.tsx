import { LoaderCircle, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMatchmakingStore } from './matchmaking.store'

export function ConnectionBanner(): React.JSX.Element | null {
  const connectionStatus = useMatchmakingStore((state) => state.connectionStatus)
  const connect = useMatchmakingStore((state) => state.connect)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOffline = (): void => setIsOnline(false)
    const handleOnline = (): void => {
      setIsOnline(true)
      // If the socket is still healthy, leave it alone. Calling connect while
      // the main process already has an open socket would otherwise leave the
      // renderer displaying a permanent "connecting" state.
      if (connectionStatus !== 'ready') void connect()
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [connect, connectionStatus])

  const isReconnecting = connectionStatus === 'reconnecting'
  if (isOnline && !isReconnecting) return null

  return (
    <aside
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 border-b border-amber-300/30 bg-amber-950/95 px-4 py-2.5 text-sm font-medium text-amber-100 shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="size-4" aria-hidden="true" />
      <span>
        {isOnline
          ? 'Disconnected from server. Reconnecting...'
          : 'No internet connection. Reconnecting when it returns...'}
      </span>
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
    </aside>
  )
}
