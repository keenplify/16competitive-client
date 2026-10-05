import { LoaderCircle, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { useMatchmakingStore } from './matchmaking.store'

export function ConnectionBanner(): React.JSX.Element | null {
  const connectionStatus = useMatchmakingStore((state) => state.connectionStatus)
  const connect = useMatchmakingStore((state) => state.connect)
  const hasSession = useAuthStore((state) => state.session !== null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOffline = (): void => setIsOnline(false)
    const handleOnline = (): void => {
      setIsOnline(true)
      if (hasSession) void connect()
    }
    const handleFocus = (): void => {
      if (hasSession) void connect()
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('focus', handleFocus)
    }
  }, [connect, hasSession])

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
