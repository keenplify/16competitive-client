export const MODEL_CHANNELS = {
  read: 'models:read',
  readThumbnail: 'models:read-thumbnail',
  writeThumbnail: 'models:write-thumbnail'
} as const

export type ModelApi = {
  /** Reads an MDL relative to the selected Counter-Strike models directory. */
  read: (relativePath: string) => Promise<ArrayBuffer>
  readThumbnail: (cacheKey: string) => Promise<ArrayBuffer | null>
  writeThumbnail: (cacheKey: string, png: ArrayBuffer) => Promise<void>
}
