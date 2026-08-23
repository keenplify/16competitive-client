export const WINDOW_CHANNELS = {
  maximize: 'window:maximize'
} as const

export interface WindowApi {
  maximize(): Promise<void>
}
