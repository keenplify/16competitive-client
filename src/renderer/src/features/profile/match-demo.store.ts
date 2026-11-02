import { useProfileStore } from './profile.store'
import { useMatchDetailsStore } from './match-details.store'
import { create } from 'zustand'
import { toast } from 'react-toastify'
import { translate, useLanguageStore } from '../i18n/i18n'

interface MatchDemoState {
  preparing: string | null
  watch: (matchId: string) => Promise<void>
}
export const useMatchDemoStore = create<MatchDemoState>((set, get) => ({
  preparing: null,
  watch: async (matchId) => {
    if (get().preparing) return
    // Native modal dialogs otherwise place global toasts behind their backdrop.
    useMatchDetailsStore.getState().close()
    useProfileStore.getState().dismiss()
    const language = useLanguageStore.getState().language
    const id = toast.loading(translate(language, 'demo.preparing'), {
      style: { borderRadius: 0 },
      closeButton: false,
      closeOnClick: false
    })
    set({ preparing: matchId })
    try {
      if (!window.api.matchHistory.watchDemo) throw new Error('Desktop launcher required')
      await window.api.matchHistory.watchDemo(matchId)
      toast.update(id, {
        render: translate(language, 'demo.opened'),
        type: 'success',
        isLoading: false,
        autoClose: 5000,
        closeButton: true
      })
    } catch (error) {
      console.warn('[MatchDemo] Playback declined or failed', error)
      const message = error instanceof Error ? error.message : String(error)
      const key = message.includes('MATCH_DEMO_BUSY')
        ? 'demo.busy'
        : message.includes('MATCH_DEMO_UNAVAILABLE')
          ? 'demo.unavailable'
          : message.includes('MATCH_DEMO_INSTALLATION')
            ? 'demo.installation'
            : 'demo.error'
      toast.update(id, {
        render: translate(language, key),
        type: 'error',
        isLoading: false,
        autoClose: 10000,
        closeButton: true
      })
    } finally {
      set({ preparing: null })
    }
  }
}))
