import { create } from 'zustand'
import type { SetupMode } from '../../../../shared/game-settings'

type OnboardingStep =
  'installation' | 'legacy' | 'appearance' | 'preferences' | 'community' | 'referral' | 'review'

interface OnboardingState {
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
  wantsCs13: null,
  setWantsCs13: (value) => set({ wantsCs13: value }),
  step: 'installation',
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
    set({ wantsCs13: null, step: 'installation', mode: 'recommended', completionPhase: 'idle' })
}))
