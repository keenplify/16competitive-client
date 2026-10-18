import { create } from 'zustand'
import type {
  CommunityCard,
  CommunityDirectoryQuery,
  CommunityDirectoryResult,
  CommunityUpdate
} from '../../../../shared/community-directory'
import type { PartnerServer } from '../../../../shared/partner-community'
import { useAuthStore } from '../auth/auth.store'
import { usePartnerBrandingStore } from '../partner-branding/partner-branding.store'
import { usePartnerServersStore } from '../partner-branding/partner-servers.store'
import { useCommunityChatStore } from '../partner-branding/community-chat.store'
import { useCommunityMembersStore } from '../partner-branding/community-members.store'
import { useCommunityMembershipStore } from '../partner-branding/community-membership.store'

type State = CommunityDirectoryResult & {
  view: 'home' | 'discover'
  setView: (view: 'home' | 'discover') => void
  editing: boolean
  editTarget: CommunityCard | null
  editDraft: CommunityUpdate
  editLoading: boolean
  editLoadError: boolean
  savedServerIds: string[]
  uploadingServerId: string | null
  uploadErrorServerId: string | null
  uploadServerImage: (id: string, file: File) => Promise<void>
  saving: boolean
  saveError: boolean
  startEdit: (community: CommunityCard) => void
  cancelEdit: () => void
  updateDraft: (patch: Partial<CommunityUpdate>) => void
  addServer: () => void
  updateServer: (id: string, patch: Partial<PartnerServer>) => void
  removeServer: (id: string) => void
  saveEdit: () => Promise<void>
  query: CommunityDirectoryQuery
  loading: boolean
  loadingMore: boolean
  loadMoreError: boolean
  error: boolean
  joining: boolean
  joinError: boolean
  leaveRequested: boolean
  requestLeave: (requested: boolean) => void
  leave: () => Promise<void>
  selected: CommunityCard | null
  updateQuery: (patch: Partial<CommunityDirectoryQuery>) => void
  load: () => Promise<void>
  loadMore: () => Promise<void>
  select: (community: CommunityCard | null) => void
  join: () => Promise<void>
  clear: () => void
}
const initialQuery: CommunityDirectoryQuery = {
  cursor: null,
  search: '',
  category: '',
  country: ''
}
let generation = 0
export const useCommunitiesStore = create<State>((set, get) => ({
  query: initialQuery,
  view: 'home',
  setView: (view) => set({ view, selected: null, joinError: false }),
  editing: false,
  editTarget: null,
  editDraft: { name: '', description: '', servers: [] },
  editLoading: false,
  editLoadError: false,
  savedServerIds: [],
  uploadingServerId: null,
  uploadErrorServerId: null,
  saving: false,
  saveError: false,
  startEdit: async (community) => {
    const accountId = useAuthStore.getState().session?.player.id
    if (community.id !== accountId) return
    set({
      editing: true,
      editTarget: community,
      editDraft: { name: community.name, description: community.description, servers: [] },
      editLoading: true,
      editLoadError: false,
      savedServerIds: [],
      uploadErrorServerId: null,
      saveError: false
    })
    try {
      const details = await window.api.communityDirectory.ownerSettings()
      if (
        useAuthStore.getState().session?.player.id !== accountId ||
        get().editTarget?.id !== accountId
      )
        return
      set({
        editDraft: details,
        savedServerIds: details.servers.map((server) => server.id),
        editLoading: false
      })
    } catch {
      if (get().editTarget?.id === accountId) set({ editLoading: false, editLoadError: true })
    }
  },
  cancelEdit: () => {
    if (!get().saving && !get().uploadingServerId)
      set({ editing: false, editTarget: null, saveError: false, editLoadError: false })
  },
  updateDraft: (patch) => set({ editDraft: { ...get().editDraft, ...patch }, saveError: false }),
  addServer: () => {
    const servers = get().editDraft.servers
    if (servers.length >= 16) return
    get().updateDraft({
      servers: [
        ...servers,
        {
          id: crypto.randomUUID(),
          name: '',
          host: '',
          port: 27015,
          category: 'pub',
          countryCode: null,
          gameVersion: 'cs16'
        }
      ]
    })
  },
  updateServer: (id, patch) =>
    get().updateDraft({
      servers: get().editDraft.servers.map((server) =>
        server.id === id ? { ...server, ...patch } : server
      )
    }),
  removeServer: (id) =>
    get().updateDraft({ servers: get().editDraft.servers.filter((server) => server.id !== id) }),
  uploadServerImage: async (id, file) => {
    if (get().uploadingServerId || get().saving || !get().savedServerIds.includes(id)) return
    if (
      file.size < 12 ||
      file.size > 5 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)
    ) {
      set({ uploadErrorServerId: id })
      return
    }
    const accountId = useAuthStore.getState().session?.player.id
    set({ uploadingServerId: id, uploadErrorServerId: null })
    try {
      const result = await window.api.communityDirectory.uploadServerImage(
        id,
        new Uint8Array(await file.arrayBuffer())
      )
      if (useAuthStore.getState().session?.player.id !== accountId) return
      get().updateServer(id, { imageUrl: result.imageUrl })
      void usePartnerServersStore.getState().load()
    } catch {
      if (useAuthStore.getState().session?.player.id === accountId) set({ uploadErrorServerId: id })
    } finally {
      if (useAuthStore.getState().session?.player.id === accountId) set({ uploadingServerId: null })
    }
  },
  saveEdit: async () => {
    const { editTarget, editDraft, saving, editLoading, editLoadError, uploadingServerId } = get()
    const accountId = useAuthStore.getState().session?.player.id
    if (
      !accountId ||
      editTarget?.id !== accountId ||
      saving ||
      uploadingServerId ||
      editLoading ||
      editLoadError ||
      !editDraft.name.trim()
    )
      return
    set({ saving: true, saveError: false })
    try {
      await window.api.communityDirectory.update(editDraft)
      if (useAuthStore.getState().session?.player.id !== accountId) return
      await get().load()
      if (get().error) throw new Error('COMMUNITY_REFRESH_FAILED')
      set({ editing: false, editTarget: null, saving: false, saveError: false })
      void usePartnerBrandingStore.getState().refresh(accountId)
      void usePartnerServersStore.getState().load()
    } catch {
      if (useAuthStore.getState().session?.player.id === accountId)
        set({ saving: false, saveError: true })
    }
  },
  currentCommunity: null,
  leaveRequested: false,
  communities: [],
  currentCommunityId: null,
  viewerCountryCode: null,
  nextCursor: null,
  loading: true,
  loadingMore: false,
  loadMoreError: false,
  error: false,
  joining: false,
  joinError: false,
  selected: null,
  updateQuery: (patch) => {
    if (get().joining) return
    generation++
    set({
      query: { ...get().query, cursor: null, ...patch },
      loading: true,
      loadingMore: false,
      loadMoreError: false,
      error: false,
      communities: [],
      nextCursor: null,
      selected: null,
      joinError: false
    })
  },
  load: async () => {
    const accountId = useAuthStore.getState().session?.player.id
    if (!accountId) return
    const serial = ++generation
    set({ loading: true, loadingMore: false, loadMoreError: false, error: false })
    try {
      const result = await window.api.communityDirectory.list(get().query)
      if (serial === generation && useAuthStore.getState().session?.player.id === accountId)
        set({ ...result, loading: false, loadingMore: false, loadMoreError: false })
    } catch {
      if (serial === generation) set({ loading: false, error: true })
    }
  },
  loadMore: async () => {
    const accountId = useAuthStore.getState().session?.player.id
    const { nextCursor, loading, loadingMore, joining } = get()
    if (!accountId || !nextCursor || loading || loadingMore || joining) return
    const serial = generation
    set({ loadingMore: true, loadMoreError: false })
    try {
      const result = await window.api.communityDirectory.list({
        ...get().query,
        cursor: nextCursor
      })
      if (serial !== generation || useAuthStore.getState().session?.player.id !== accountId) return
      set((state) => ({
        currentCommunity: result.currentCommunity,
        currentCommunityId: result.currentCommunityId,
        viewerCountryCode: result.viewerCountryCode,
        nextCursor: result.nextCursor,
        communities: [
          ...new Map(
            [...state.communities, ...result.communities].map((row) => [row.id, row])
          ).values()
        ],
        loadingMore: false,
        loadMoreError: false
      }))
    } catch {
      if (serial === generation) set({ loadingMore: false, loadMoreError: true })
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
        view: 'discover',
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
        view: 'home',
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
      view: 'home',
      editing: false,
      editTarget: null,
      editDraft: { name: '', description: '', servers: [] },
      editLoading: false,
      editLoadError: false,
      savedServerIds: [],
      uploadingServerId: null,
      uploadErrorServerId: null,
      saving: false,
      saveError: false,
      currentCommunity: null,
      leaveRequested: false,
      communities: [],
      currentCommunityId: null,
      viewerCountryCode: null,
      nextCursor: null,
      loading: true,
      loadingMore: false,
      loadMoreError: false,
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
