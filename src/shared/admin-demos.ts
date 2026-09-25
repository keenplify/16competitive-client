export interface AdminDemo {
  id: string
  matchId: string
  username: string
  status: string
  requestedAt: string
  sizeBytes: number | null
}
export interface AdminDemoList {
  recordings: AdminDemo[]
  hasMore: boolean
}
export interface AdminDemosApi {
  list(page: number): Promise<AdminDemoList | null>
  watch(id: string): Promise<void>
}
export const ADMIN_DEMO_CHANNELS = { list: 'admin-demos:list', watch: 'admin-demos:watch' } as const
