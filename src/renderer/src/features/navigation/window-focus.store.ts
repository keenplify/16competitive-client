import { create } from 'zustand'

type WindowSurface = 'page' | 'chat'

interface WindowFocusState {
  activeSurface: WindowSurface
  activate: (surface: WindowSurface) => void
}

/** Transient desktop focus; never persisted across launcher sessions. */
export const useWindowFocusStore = create<WindowFocusState>((set) => ({
  activeSurface: 'page',
  activate: (activeSurface) => set({ activeSurface })
}))
