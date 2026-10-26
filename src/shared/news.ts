export const NEWS_CHANNELS = {
  getPreview: 'news:get-preview',
  getAll: 'news:get-all',
  getVisibility: 'news:get-visibility'
} as const

export interface NewsVisibility {
  popupEnabled: boolean
  railEnabled: boolean
}

export const parseNewsVisibility = (value: unknown): NewsVisibility => {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid news visibility')
  const record = value as Record<string, unknown>
  if (typeof record.popupEnabled !== 'boolean' || typeof record.railEnabled !== 'boolean')
    throw new Error('Invalid news visibility')
  return { popupEnabled: record.popupEnabled, railEnabled: record.railEnabled }
}

export interface NewsPost {
  id: string
  createdAt: string
  url: string
  content: string
  mediaUrl: string | null
}

export interface NewsApi {
  getPreview(): Promise<NewsPost[]>
  getAll(): Promise<NewsPost[]>
  getVisibility(): Promise<NewsVisibility>
}
