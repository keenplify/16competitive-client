import { create } from 'zustand'

interface NativeVoiceState {
  requestedPartnerId: string | null
  matchId: string | null
  owned: boolean
  connected: boolean
  observe: (matchId: string) => () => void
}

let generation = 0
export const useNativeVoiceStore = create<NativeVoiceState>((set) => ({
  requestedPartnerId: null,
  matchId: null,
  owned: false,
  connected: false,
  observe: (matchId) => {
    const current = ++generation
    let timer: ReturnType<typeof setTimeout> | undefined
    set({ matchId, owned: false, connected: false })
    const poll = async (): Promise<void> => {
      try {
        const status = await window.api.gameSettings.nativeSessionStatus(matchId)
        if (current === generation) set(status)
      } catch {
        // An unavailable helper cannot claim browser microphone ownership.
        if (current === generation) set({ owned: false, connected: false })
      }
      if (current === generation) timer = setTimeout(() => void poll(), 1000)
    }
    void poll()
    return () => {
      if (current !== generation) return
      generation++
      if (timer) clearTimeout(timer)
      set({ matchId: null, owned: false, connected: false })
    }
  }
}))
