import { useEffect, useRef, type JSX } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { useChatTranslationStore } from './chat-translation.store'

/** Loads the account preference without enabling translation automatically. */
export function ChatTranslationInitializer(): JSX.Element | null {
  const playerId = useAuthStore((state) => state.session?.player.id)
  const load = useChatTranslationStore((state) => state.load)
  const reset = useChatTranslationStore((state) => state.reset)
  const initializedPlayer = useRef<string | null>(null)

  useEffect(() => {
    if (!playerId) {
      initializedPlayer.current = null
      reset()
      return
    }
    if (initializedPlayer.current === playerId) return
    initializedPlayer.current = playerId
    void load()
  }, [playerId, load, reset])

  return null
}
