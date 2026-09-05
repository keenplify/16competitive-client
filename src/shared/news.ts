export const NEWS_CHANNELS = {
  getPreview: 'news:get-preview',
  getAll: 'news:get-all'
} as const

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
}
