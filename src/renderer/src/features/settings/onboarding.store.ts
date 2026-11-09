import { create } from 'zustand'
import type { SetupMode } from '../../../../shared/game-settings'

type OnboardingStep =
  | 'games'
  | 'installation'
  | 'legacy'
  | 'appearance'
  | 'preferences'
  | 'community'
  | 'referral'
  | 'review'

interface OnboardingState {
  games: 'cs16' | 'cs13' | 'both' | null
  setGames: (games: 'cs16' | 'cs13' | 'both') => void
  wantsCs13: boolean | null
  setWantsCs13: (value: boolean) => void
  step: OnboardingStep
  mode: SetupMode
  completionPhase: 'idle' | 'finishing' | 'success' | 'done'
  setStep: (step: OnboardingStep) => void
  setMode: (mode: SetupMode) => void
  beginFinish: () => void
  finishFailed: () => void
  finishSucceeded: () => void
  reset: () => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  games: null,
  setGames: (games) => set({ games, wantsCs13: games !== 'cs16' }),
  wantsCs13: null,
  setWantsCs13: (value) => set({ wantsCs13: value }),
  step: 'games',
  mode: 'recommended',
  completionPhase: 'idle',
  setStep: (step) => set({ step }),
  setMode: (mode) => set({ mode }),
  beginFinish: () => set({ completionPhase: 'finishing' }),
  finishFailed: () => set({ completionPhase: 'idle' }),
  finishSucceeded: () => {
    set({ completionPhase: 'success' })
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => set({ completionPhase: 'done' }), reduceMotion ? 150 : 950)
  },
  reset: () =>
    set({
      games: null,
      wantsCs13: null,
      step: 'games',
      mode: 'recommended',
      completionPhase: 'idle'
    })
}))
