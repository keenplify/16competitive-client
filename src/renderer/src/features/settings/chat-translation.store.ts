import { create } from 'zustand'
import type { ChatTranslationLanguage } from '../../../../shared/auth'

interface ChatTranslationState {
  language: ChatTranslationLanguage
  status: 'idle' | 'loading' | 'saving'
  error: boolean
  load: (defaultLanguage: string) => Promise<void>
  setLanguage: (language: ChatTranslationLanguage) => Promise<void>
  reset: () => void
}

let requestGeneration = 0

export const useChatTranslationStore = create<ChatTranslationState>((set) => ({
  language: null,
  status: 'idle',
  error: false,
  load: async (defaultLanguage) => {
    const generation = ++requestGeneration
    set({ language: null, status: 'loading', error: false })
    try {
      const preference = await window.api.auth.getChatTranslation()
      if (generation !== requestGeneration) return
      const language =
        preference.language === null
          ? (await window.api.auth.setChatTranslation(defaultLanguage)).language
          : preference.language
      if (generation !== requestGeneration) return
      set({ language, status: 'idle' })
    } catch {
      if (generation !== requestGeneration) return
      set({ status: 'idle', error: true })
    }
  },
  setLanguage: async (language) => {
    const generation = ++requestGeneration
    set({ status: 'saving', error: false })
    try {
      const preference = await window.api.auth.setChatTranslation(language)
      if (generation !== requestGeneration) return
      set({ language: preference.language, status: 'idle' })
    } catch {
      if (generation !== requestGeneration) return
      set({ status: 'idle', error: true })
    }
  },
  reset: () => {
    requestGeneration++
    set({ language: null, status: 'idle', error: false })
  }
}))
