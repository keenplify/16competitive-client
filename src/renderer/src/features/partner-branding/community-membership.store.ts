import { create } from 'zustand'
import type { CommunityTransferRequest } from '../../../../shared/community-membership'
import { useAuthStore } from '../auth/auth.store'
import { usePartnerBrandingStore } from './partner-branding.store'
import { usePartnerServersStore } from './partner-servers.store'
import { useCommunityChatStore } from './community-chat.store'
import { useCommunityMembersStore } from './community-members.store'
type State = {
  accountId: string | null
  pending: CommunityTransferRequest | null
  loading: boolean
  deciding: boolean
  error: boolean
  linkCode: string
  linking: boolean
  linkResult: 'idle' | 'success' | 'error'
  load: (accountId: string) => Promise<void>
  decide: (accept: boolean) => Promise<boolean>
  setLinkCode: (code: string) => void
  linkServer: () => Promise<void>
  clear: () => void
}
let generation = 0
export const useCommunityMembershipStore = create<State>((set, get) => ({
  accountId: null,
  pending: null,
  loading: false,
  deciding: false,
  error: false,
  linkCode: '',
  linking: false,
  linkResult: 'idle',
  load: async (accountId) => {
    if (get().deciding || (get().loading && get().accountId === accountId)) return
    const serial = ++generation
    set((state) => ({
      accountId,
      loading: true,
      error: false,
      ...(state.accountId !== accountId
        ? {
            pending: null,
            linkCode: '',
            linkResult: 'idle' as const,
            linking: false,
            deciding: false
          }
        : {})
    }))
    try {
      const pending = await window.api.communityMembership.pending()
      if (generation === serial && useAuthStore.getState().session?.player.id === accountId)
        set({ pending, loading: false })
    } catch {
      if (generation === serial) set({ loading: false, error: true })
    }
  },
  decide: async (accept) => {
    const { pending, accountId, deciding } = get()
    if (
      !pending ||
      !accountId ||
      deciding ||
      useAuthStore.getState().session?.player.id !== accountId
    )
      return false
    const serial = ++generation
    set({ deciding: true, loading: false, error: false })
    try {
      await window.api.communityMembership.decide(pending.id, accept)
      if (generation !== serial || useAuthStore.getState().session?.player.id !== accountId)
        return false
      set({ pending: null, deciding: false })
      if (accept) {
        usePartnerBrandingStore.getState().clear()
        usePartnerServersStore.getState().clear()
        useCommunityChatStore.getState().clear()
        useCommunityMembersStore.getState().clear()
        await Promise.allSettled([
          usePartnerBrandingStore.getState().refresh(accountId),
          usePartnerServersStore.getState().load(),
          useCommunityChatStore.getState().load()
        ])
      }
      return true
    } catch {
      if (generation === serial) set({ deciding: false, error: true })
      return false
    }
  },
  setLinkCode: (code) =>
    set({
      linkCode: code
        .replace(/[^a-fA-F0-9]/g, '')
        .slice(0, 12)
        .toUpperCase(),
      linkResult: 'idle'
    }),
  linkServer: async () => {
    const { linkCode, linking } = get(),
      accountId = useAuthStore.getState().session?.player.id
    if (!accountId || linking || !/^[A-F0-9]{12}$/.test(linkCode)) return
    set({ accountId, linking: true, linkResult: 'idle' })
    try {
      await window.api.communityMembership.linkServer(linkCode)
      if (useAuthStore.getState().session?.player.id !== accountId) return
      set({ linking: false, linkCode: '', linkResult: 'success' })
      await get().load(accountId)
    } catch {
      if (useAuthStore.getState().session?.player.id === accountId)
        set({ linking: false, linkResult: 'error' })
    }
  },
  clear: () => {
    generation++
    set({
      accountId: null,
      pending: null,
      loading: false,
      deciding: false,
      error: false,
      linkCode: '',
      linking: false,
      linkResult: 'idle'
    })
  }
}))
