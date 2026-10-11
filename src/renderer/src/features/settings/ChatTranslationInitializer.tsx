import { useEffect, useRef, type JSX } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { useLanguageStore } from '../i18n/i18n'
import { useChatTranslationStore } from './chat-translation.store'

/** Saves the first account preference using the launcher's selected language. */
export function ChatTranslationInitializer(): JSX.Element | null {
  const playerId = useAuthStore((state) => state.session?.player.id)
  const language = useLanguageStore((state) => state.language)
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
    void load(language === 'pt' ? 'pt-br' : language)
  }, [playerId, language, load, reset])

  return null
}
