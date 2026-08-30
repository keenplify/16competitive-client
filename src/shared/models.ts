export const MODEL_CHANNELS = {
  read: 'models:read'
} as const

export type ModelApi = {
  /** Reads an MDL relative to the selected Counter-Strike models directory. */
  read: (relativePath: string) => Promise<ArrayBuffer>
}
