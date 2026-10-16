import { create } from 'zustand'
import type { PaymentSnapshot } from '../../../../shared/payments'
import { useAuthStore } from '../auth/auth.store'

interface PaymentsState {
  ownerId: string | null
  open: boolean
  amount: string
  snapshot: PaymentSnapshot | null
  busy: boolean
  error: boolean
  initialize: (ownerId: string | null) => void
  toggle: () => void
  setAmount: (amount: string) => void
  load: (orderId?: string) => Promise<void>
  create: () => Promise<void>
}

export const usePaymentsStore = create<PaymentsState>((set, get) => ({
  ownerId: null,
  open: false,
  amount: '10',
  snapshot: null,
  busy: false,
  error: false,
  initialize(ownerId) {
    if (get().ownerId === ownerId) return
    set({ ownerId, open: false, snapshot: null, busy: false, error: false, amount: '10' })
  },
  toggle: () => set((state) => ({ open: !state.open })),
  setAmount: (amount) => set({ amount }),
  async load(orderId) {
    const ownerId = get().ownerId
    if (!ownerId || get().busy) return
    set({ busy: true, error: false })
    const current = () =>
      get().ownerId === ownerId && useAuthStore.getState().session?.player.id === ownerId
    try {
      const snapshot = orderId
        ? await window.api.skins.refreshPayment(orderId)
        : await window.api.skins.payments()
      if (current()) set({ snapshot })
    } catch {
      if (current()) set({ error: true })
    } finally {
      if (current()) set({ busy: false })
    }
  },
  async create() {
    const { ownerId, amount, busy } = get()
    if (!ownerId || busy || !/^\d+$/.test(amount) || Number(amount) < 1 || Number(amount) > 10_000)
      return
    set({ busy: true, error: false })
    const current = () =>
      get().ownerId === ownerId && useAuthStore.getState().session?.player.id === ownerId
    try {
      // The persisted order appears in history even if the client loses this response.
      await window.api.skins.createPayment(crypto.randomUUID(), Number(amount))
      const snapshot = await window.api.skins.payments()
      if (current()) set({ snapshot })
    } catch {
      if (current()) {
        set({ error: true })
        try {
          const snapshot = await window.api.skins.payments()
          if (current()) set({ snapshot })
        } catch {
          /* Keep the previous snapshot and the translated retry notice. */
        }
      }
    } finally {
      if (current()) set({ busy: false })
    }
  }
}))

// Remove account-scoped checkout links as soon as authentication changes, even off the Store screen.
useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id !== previous.session?.player.id) {
    usePaymentsStore.getState().initialize(state.session?.player.id ?? null)
  }
})
