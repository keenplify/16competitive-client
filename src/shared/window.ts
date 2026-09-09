export const WINDOW_CHANNELS = {
  maximize: 'window:maximize',
  focus: 'window:focus',
  openCounterStrikeSteamStore: 'window:open-counter-strike-steam-store',
  exit: 'window:exit'
} as const

export interface WindowApi {
  maximize(): Promise<void>
  focus(): Promise<void>
  openCounterStrikeSteamStore(): Promise<void>
  exit(): Promise<void>
}
