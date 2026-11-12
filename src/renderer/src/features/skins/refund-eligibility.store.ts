import { create } from 'zustand'
import type { OwnedSkin } from '../../../../shared/skins'
import { useAuthStore } from '../auth/auth.store'

export type RefundEligibility =
  'eligible' | 'checking' | 'notPurchased' | 'notResellable' | 'notOwned' | 'unavailable'
export const refundKey = (owned: OwnedSkin): string => `${owned.skin.id}:${owned.acquiredAt}`
export const refundFailure = (error: unknown): RefundEligibility => {
  const value = error as { code?: string; message?: string }
  const code = value?.code ?? value?.message ?? ''
  if (code.includes('SKIN_NOT_PURCHASED')) return 'notPurchased'
  if (code.includes('SKIN_NOT_RESELLABLE')) return 'notResellable'
  if (code.includes('SKIN_NOT_OWNED')) return 'notOwned'
  return 'unavailable'
}
let generation = 0
export const useRefundEligibilityStore = create<{
  entries: Record<string, RefundEligibility>
  load: (owned: OwnedSkin[]) => Promise<void>
}>((set, get) => ({
  entries: {},
  load: async (owned) => {
    const current = generation
    const pending = owned.filter(
      (item) =>
        !item.reviewOnly &&
        item.skin.status !== 'DRAFT' &&
        (!get().entries[refundKey(item)] || get().entries[refundKey(item)] === 'unavailable')
    )
    set({
      entries: {
        ...get().entries,
        ...Object.fromEntries(pending.map((item) => [refundKey(item), 'checking' as const]))
      }
    })
    let index = 0
    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, async () => {
        while (index < pending.length && current === generation) {
          const item = pending[index++]
          let status: RefundEligibility = 'eligible'
          try {
            await window.api.skins.resaleQuote(item.skin.id)
          } catch (error) {
            status = refundFailure(error)
          }
          if (current === generation)
            set({ entries: { ...get().entries, [refundKey(item)]: status } })
        }
      })
    )
  }
}))
useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id !== previous.session?.player.id) {
    generation++
    useRefundEligibilityStore.setState({ entries: {} })
  }
})
