import { create } from 'zustand'
import type { PaymentSnapshot } from '../../../../shared/payments'
import { useAuthStore } from '../auth/auth.store'

interface PaymentsState {
  methodId: string
  activeManualId: string | null
  senderName: string
  reference: string
  selectMethod: (methodId: string) => void
  resumeManual: (id: string) => void
  setTransferDetails: (field: 'senderName' | 'reference', value: string) => void
  manualAction: (action: 'create' | 'submit' | 'cancel') => Promise<void>
  ownerId: string | null
  open: boolean
  amount: string
  snapshot: PaymentSnapshot | null
  busy: boolean
  error: boolean
  initialize: (ownerId: string | null) => void
  toggle: () => void
  close: () => void
  setAmount: (amount: string) => void
  load: (orderId?: string) => Promise<void>
  create: () => Promise<void>
}

export const usePaymentsStore = create<PaymentsState>((set, get) => ({
  methodId: 'paymento',
  activeManualId: null,
  senderName: '',
  reference: '',
  selectMethod: (methodId) =>
    set({ methodId, activeManualId: null, senderName: '', reference: '', error: false }),
  resumeManual: (id) => {
    const order = get().snapshot?.manual?.orders.find((o) => o.id === id)
    if (order)
      set({
        methodId: order.methodId,
        activeManualId: id,
        senderName: order.senderName ?? '',
        reference: order.reference ?? '',
        error: false
      })
  },
  setTransferDetails: (field, value) => set({ [field]: value }),
  async manualAction(action) {
    const { ownerId, methodId, amount, activeManualId, senderName, reference, busy } = get()
    if (!ownerId || busy) return
    set({ busy: true, error: false })
    const current = () =>
      get().ownerId === ownerId && useAuthStore.getState().session?.player.id === ownerId
    try {
      const order =
        action === 'create'
          ? await window.api.skins.createManualPayment(
              crypto.randomUUID(),
              methodId,
              Number(amount)
            )
          : action === 'submit'
            ? await window.api.skins.submitManualPayment(activeManualId!, senderName, reference)
            : await window.api.skins.cancelManualPayment(activeManualId!)
      if (current())
        set((state) => ({
          activeManualId: order.id,
          snapshot: state.snapshot
            ? {
                ...state.snapshot,
                manual: {
                  methods: state.snapshot.manual?.methods ?? [],
                  orders: [
                    order,
                    ...(state.snapshot.manual?.orders ?? []).filter((o) => o.id !== order.id)
                  ].slice(0, 10)
                }
              }
            : null
        }))
      const snapshot = await window.api.skins.payments()
      if (current()) set({ snapshot })
    } catch {
      if (current()) {
        set({ error: true })
        try {
          const snapshot = await window.api.skins.payments()
          if (current()) set({ snapshot })
        } catch {
          /* Preserve the previous snapshot for recovery. */
        }
      }
    } finally {
      if (current()) set({ busy: false })
    }
  },
  ownerId: null,
  open: false,
  amount: '10',
  snapshot: null,
  busy: false,
  error: false,
  initialize(ownerId) {
    if (get().ownerId === ownerId) return
    set({
      methodId: 'paymento',
      activeManualId: null,
      senderName: '',
      reference: '',
      ownerId,
      open: false,
      snapshot: null,
      busy: false,
      error: false,
      amount: '10'
    })
  },
  toggle: () => set((state) => ({ open: !state.open })),
  close: () => set({ open: false }),
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
