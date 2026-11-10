import { preferredPaymentProvider } from '../../../../shared/payment-preference'
import { toast } from 'react-toastify'
import { translate, useLanguageStore } from '../i18n/i18n'
import { create } from 'zustand'
import { usdFromPCash, type PaymentSnapshot } from '../../../../shared/payments'
import { useAuthStore } from '../auth/auth.store'

interface PaymentsState {
  customOpen: boolean
  choosePreset: (amount: string) => void
  showCustom: () => void
  historyOpen: boolean
  showHistory: () => void
  hideHistory: () => void
  methodId: string
  preferredProvider: 'paymento' | 'paymongo'
  methodResolved: boolean
  closeDetails: () => void
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
  load: (orderId?: string, provider?: 'paymento' | 'paymongo', feedback?: boolean) => Promise<void>
  create: () => Promise<void>
}

export const usePaymentsStore = create<PaymentsState>((set, get) => ({
  customOpen: false,
  choosePreset: (amount) => set({ amount, customOpen: false }),
  showCustom: () => set({ customOpen: true }),
  historyOpen: false,
  showHistory: () => {
    set({ historyOpen: true })
    void get().load(undefined, undefined, true)
  },
  hideHistory: () => set({ historyOpen: false }),
  methodId: 'paymento',
  preferredProvider: 'paymento',
  methodResolved: false,
  closeDetails: () => set({ activeManualId: null }),
  activeManualId: null,
  senderName: '',
  reference: '',
  selectMethod: (methodId) =>
    set({
      methodId,
      methodResolved: true,
      activeManualId: null,
      senderName: '',
      reference: '',
      error: false
    }),
  resumeManual: (id) => {
    const order = get().snapshot?.manual?.orders.find((o) => o.id === id)
    if (order)
      set({
        activeManualId: id,
        senderName: order.senderName ?? '',
        reference: order.reference ?? '',
        error: false
      })
  },
  setTransferDetails: (field, value) => set({ [field]: value }),
  async manualAction(action) {
    const { ownerId, methodId, amount, activeManualId, senderName, reference, busy } = get()
    const usd = usdFromPCash(amount)
    if (!ownerId || busy || (action === 'create' && usd === null)) return
    set({ busy: true, error: false })
    const current = () =>
      get().ownerId === ownerId && useAuthStore.getState().session?.player.id === ownerId
    try {
      const order =
        action === 'create'
          ? await window.api.skins.createManualPayment(crypto.randomUUID(), methodId, usd!)
          : action === 'submit'
            ? await window.api.skins.submitManualPayment(activeManualId!, senderName, reference)
            : await window.api.skins.cancelManualPayment(activeManualId!)
      if (current())
        set((state) => ({
          activeManualId: action === 'create' ? order.id : state.activeManualId,
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
  amount: '1000',
  snapshot: null,
  busy: false,
  error: false,
  initialize(ownerId) {
    if (get().ownerId === ownerId) return
    set({
      customOpen: false,
      historyOpen: false,
      methodId: 'paymento',
      preferredProvider: preferredPaymentProvider(
        useAuthStore.getState().session?.player.flagCountryCode,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.languages
      ),
      methodResolved: false,
      activeManualId: null,
      senderName: '',
      reference: '',
      ownerId,
      open: false,
      snapshot: null,
      busy: false,
      error: false,
      amount: '1000'
    })
  },
  toggle: () => set((state) => ({ open: !state.open, historyOpen: false, activeManualId: null })),
  close: () => set({ open: false, historyOpen: false, activeManualId: null }),
  setAmount: (amount) => set({ amount }),
  async load(orderId, provider, feedback = false) {
    const ownerId = get().ownerId
    if (!ownerId || get().busy) return
    const notification = feedback
      ? toast.loading(translate(useLanguageStore.getState().language, 'payments.loading'))
      : null
    set({ busy: true, error: false })
    const current = () =>
      get().ownerId === ownerId && useAuthStore.getState().session?.player.id === ownerId
    try {
      const snapshot = orderId
        ? await window.api.skins.refreshPayment(orderId, provider)
        : await window.api.skins.payments()
      if (current())
        set((state) => ({
          snapshot,
          ...(state.methodResolved
            ? {}
            : {
                methodId:
                  state.preferredProvider === 'paymongo' && snapshot.paymongo?.enabled
                    ? 'paymongo'
                    : 'paymento',
                methodResolved: true
              })
        }))
      if (notification !== null)
        toast.update(notification, {
          render: translate(useLanguageStore.getState().language, 'payments.updated'),
          isLoading: false,
          type: 'success',
          autoClose: 3000
        })
    } catch {
      if (notification !== null)
        toast.update(notification, {
          render: translate(useLanguageStore.getState().language, 'payments.error'),
          isLoading: false,
          type: 'error',
          autoClose: 7000
        })
      if (current()) set({ error: true })
    } finally {
      if (current()) set({ busy: false })
    }
  },
  async create() {
    const { ownerId, amount, busy, methodId } = get()
    const usd = usdFromPCash(amount)
    if (!ownerId || busy || usd === null) return
    const notification = toast.loading(
      translate(useLanguageStore.getState().language, 'payments.status.CREATING')
    )
    set({ busy: true, error: false })
    const current = () =>
      get().ownerId === ownerId && useAuthStore.getState().session?.player.id === ownerId
    try {
      // The persisted order appears in history even if the client loses this response.
      await window.api.skins.createPayment(
        crypto.randomUUID(),
        usd,
        methodId === 'paymongo' ? 'paymongo' : 'paymento'
      )
      toast.update(notification, {
        render: translate(useLanguageStore.getState().language, 'payments.checkoutReady'),
        isLoading: false,
        type: 'success',
        autoClose: 4000
      })
      const snapshot = await window.api.skins.payments()
      if (current()) set({ snapshot })
    } catch {
      toast.update(notification, {
        render: translate(useLanguageStore.getState().language, 'payments.error'),
        isLoading: false,
        type: 'error',
        autoClose: 7000
      })
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
