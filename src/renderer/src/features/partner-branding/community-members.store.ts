import { create } from 'zustand'
import type { CommunityMembers } from '../../../../shared/partner-community'
import { useAuthStore } from '../auth/auth.store'
type State = {
  accountId: string | null
  communityId: string | null
  expanded: boolean
  members: CommunityMembers['members']
  total: number
  hasMore: boolean
  page: number
  loading: boolean
  error: boolean
  toggle: () => void
  load: (more?: boolean) => Promise<void>
  clear: () => void
}
export const createCommunityMembersStore = (
  targetCommunityId?: string,
  ownerAccountId?: string
) => {
  let serial = 0
  return create<State>((set, get) => ({
    accountId: null,
    communityId: null,
    expanded: false,
    members: [],
    total: 0,
    hasMore: false,
    page: 0,
    loading: false,
    error: false,
    toggle: () => {
      const expanded = !get().expanded
      set({ expanded })
      if (expanded) void get().load()
    },
    load: async (more = false) => {
      const accountId = useAuthStore.getState().session?.player.id ?? null
      if (!accountId || (ownerAccountId && ownerAccountId !== accountId)) {
        get().clear()
        return
      }
      if (get().loading) return
      const request = ++serial,
        page = more ? get().page + 1 : 1
      set({ accountId, loading: true, error: false })
      try {
        const data = await window.api.communityChat.members(page, targetCommunityId)
        if (request !== serial || useAuthStore.getState().session?.player.id !== accountId) return
        if (targetCommunityId && data.communityId !== targetCommunityId)
          throw new Error('COMMUNITY_CHANGED')
        set((state) => ({
          communityId: data.communityId,
          members:
            more && state.communityId === data.communityId
              ? [
                  ...new Map(
                    [...state.members, ...data.members].map((member) => [member.id, member])
                  ).values()
                ]
              : data.members,
          total: data.total,
          hasMore: data.hasMore,
          page,
          loading: false,
          ...(!data.communityId ? { expanded: false } : {})
        }))
      } catch {
        if (request === serial) set({ loading: false, error: true })
      }
    },
    clear: () => {
      serial++
      set({
        accountId: null,
        communityId: null,
        expanded: false,
        members: [],
        total: 0,
        hasMore: false,
        page: 0,
        loading: false,
        error: false
      })
    }
  }))
}
export const useCommunityMembersStore = createCommunityMembersStore()
useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id !== previous.session?.player.id)
    useCommunityMembersStore.getState().clear()
})
