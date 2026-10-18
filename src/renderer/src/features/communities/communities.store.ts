import { create } from 'zustand'
import type {
  CommunityCard,
  CommunityDirectoryQuery,
  CommunityDirectoryResult
} from '../../../../shared/community-directory'
import { useAuthStore } from '../auth/auth.store'
import { usePartnerBrandingStore } from '../partner-branding/partner-branding.store'
import { usePartnerServersStore } from '../partner-branding/partner-servers.store'
import { useCommunityChatStore } from '../partner-branding/community-chat.store'
import { useCommunityMembersStore } from '../partner-branding/community-members.store'
import { useCommunityMembershipStore } from '../partner-branding/community-membership.store'

type State = CommunityDirectoryResult & {
  query: CommunityDirectoryQuery
  loading: boolean
  error: boolean
  joining: boolean
  joinError: boolean
  leaveRequested: boolean
  requestLeave: (requested: boolean) => void
  leave: () => Promise<void>
  selected: CommunityCard | null
  updateQuery: (patch: Partial<CommunityDirectoryQuery>) => void
  load: () => Promise<void>
  select: (community: CommunityCard | null) => void
  join: () => Promise<void>
  clear: () => void
}
const initialQuery: CommunityDirectoryQuery = { page: 1, search: '', category: '', country: '' }
let generation = 0
export const useCommunitiesStore = create<State>((set, get) => ({
  query: initialQuery,
  currentCommunity: null,
  leaveRequested: false,
  communities: [],
  currentCommunityId: null,
  viewerCountryCode: null,
  hasMore: false,
  loading: true,
  error: false,
  joining: false,
  joinError: false,
  selected: null,
  updateQuery: (patch) => {
    if (get().joining) return
    generation++
    set({
      query: { ...get().query, page: 1, ...patch },
      loading: true,
      error: false,
      selected: null,
      joinError: false
    })
  },
  load: async () => {
    const accountId = useAuthStore.getState().session?.player.id
    if (!accountId) return
    const serial = ++generation
    set({ loading: true, error: false })
    try {
      const result = await window.api.communityDirectory.list(get().query)
      if (serial === generation && useAuthStore.getState().session?.player.id === accountId)
        set({ ...result, loading: false })
    } catch {
      if (serial === generation) set({ loading: false, error: true })
    }
  },
  requestLeave: (leaveRequested) => {
    if (!get().joining) set({ leaveRequested, joinError: false })
  },
  leave: async () => {
    const { currentCommunityId, joining } = get()
    const accountId = useAuthStore.getState().session?.player.id
    if (!currentCommunityId || !accountId || joining) return
    const serial = ++generation
    set({ joining: true, joinError: false })
    try {
      await window.api.communityDirectory.leave(currentCommunityId)
      if (serial !== generation || useAuthStore.getState().session?.player.id !== accountId) return
      set({
        currentCommunityId: null,
        currentCommunity: null,
        leaveRequested: false,
        joining: false
      })
      await refreshMembership(accountId)
    } catch {
      if (serial === generation) {
        set({ joining: false, joinError: true })
        await get().load()
      }
    }
  },
  select: (selected) => {
    if (!get().joining && !get().loading) set({ selected, joinError: false })
  },
  join: async () => {
    const { selected, currentCommunityId, joining } = get()
    const accountId = useAuthStore.getState().session?.player.id
    if (!selected || !accountId || joining) return
    const serial = ++generation
    set({ joining: true, joinError: false })
    try {
      await window.api.communityDirectory.join(selected.id, currentCommunityId)
      if (serial !== generation || useAuthStore.getState().session?.player.id !== accountId) return
      set({
        currentCommunityId: selected.id,
        currentCommunity: selected,
        selected: null,
        joining: false
      })
      await refreshMembership(accountId)
    } catch {
      if (serial === generation) {
        set({ joining: false, joinError: true })
        // Refresh membership after a stale confirmation or an uncertain network result.
        await get().load()
      }
    }
  },
  clear: () => {
    generation++
    set({
      query: initialQuery,
      currentCommunity: null,
      leaveRequested: false,
      communities: [],
      currentCommunityId: null,
      viewerCountryCode: null,
      hasMore: false,
      loading: true,
      error: false,
      joining: false,
      selected: null,
      joinError: false
    })
  }
}))

async function refreshMembership(accountId: string): Promise<void> {
  usePartnerBrandingStore.getState().clear()
  usePartnerServersStore.getState().clear()
  useCommunityChatStore.getState().clear()
  useCommunityMembersStore.getState().clear()
  useCommunityMembershipStore.getState().clear()
  await Promise.allSettled([
    usePartnerBrandingStore.getState().refresh(accountId),
    usePartnerServersStore.getState().load(),
    useCommunityChatStore.getState().load(),
    useCommunityMembersStore.getState().load(),
    useCommunityMembershipStore.getState().load(accountId)
  ])
}
