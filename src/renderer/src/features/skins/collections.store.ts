import { create } from 'zustand'
import type {
  CollectionBuyInput,
  CollectionDetail,
  CollectionQuote,
  SkinCollection
} from '../../../../shared/skin-collections'
import type { SkinCurrency } from '../../../../shared/skins'
import { useAuthStore } from '../auth/auth.store'
import { usePaymentsStore } from './payments.store'

let accountGeneration = 0

type Notice = 'success' | 'error' | 'insufficient' | 'changed' | 'unavailable' | 'owned' | null
interface CollectionsState {
  collections: SkinCollection[]
  selectedId: string | null
  detail: CollectionDetail | null
  currency: SkinCurrency
  quote: CollectionQuote | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  quoteStatus: 'idle' | 'loading' | 'ready' | 'error'
  buying: boolean
  notice: Notice
  confirmation: boolean
  request: { id: string; input: CollectionBuyInput } | null
  load: () => Promise<void>
  open: (id: string) => Promise<void>
  close: () => void
  setCurrency: (currency: SkinCurrency) => Promise<void>
  refreshQuote: () => Promise<void>
  confirm: (value: boolean) => void
  buy: () => Promise<void>
  buyItem: (id: string, currency: SkinCurrency) => Promise<void>
}
const errorNotice = (error: unknown): Notice => {
  const text = error instanceof Error ? error.message : ''
  if (/INSUFFICIENT/.test(text)) return 'insufficient'
  if (/QUOTE_CHANGED/.test(text)) return 'changed'
  if (/ALREADY_OWNED/.test(text)) return 'owned'
  if (/UNAVAILABLE/.test(text)) return 'unavailable'
  return 'error'
}
const balances = (result: { points?: number; pCash?: number }) => {
  if (result.points !== undefined) useAuthStore.getState().setPoints(result.points)
  if (result.pCash !== undefined)
    usePaymentsStore.setState((state) => ({
      snapshot: state.snapshot ? { ...state.snapshot, pCash: result.pCash! } : null
    }))
}
export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  selectedId: null,
  detail: null,
  currency: 'P_CASH',
  quote: null,
  status: 'idle',
  quoteStatus: 'idle',
  buying: false,
  notice: null,
  confirmation: false,
  request: null,
  load: async () => {
    const generation = accountGeneration
    try {
      const collections = await window.api.skins.collections()
      if (generation !== accountGeneration) return
      set({ collections })
    } catch (error) {
      console.warn('[Collections] catalog unavailable', error)
      /* Home keeps its ordinary news when the optional feature is unavailable. */
    }
  },
  open: async (id) => {
    if (get().buying || (get().request && get().request!.id !== id)) return
    // Preserve an ambiguous purchase for the same package until checked.
    const request = get().request
    const generation = accountGeneration
    set({
      selectedId: id,
      detail: null,
      quote: null,
      status: 'loading',
      quoteStatus: 'idle',
      notice: request?.id === id ? 'error' : null,
      confirmation: false
    })
    try {
      const detail = await window.api.skins.collection(id)
      if (generation !== accountGeneration || get().selectedId !== id) return
      set({ detail, status: 'ready' })
      await get().refreshQuote()
    } catch {
      if (generation === accountGeneration && get().selectedId === id) set({ status: 'error' })
    }
  },
  close: () => {
    if (!get().buying && !get().request)
      set({ selectedId: null, detail: null, confirmation: false })
  },
  setCurrency: async (currency) => {
    if (get().buying || get().request) return
    set({ currency, confirmation: false })
    await get().refreshQuote()
  },
  refreshQuote: async () => {
    const generation = accountGeneration
    const { selectedId: id, currency } = get()
    if (!id || get().buying || get().request) return
    set({ quoteStatus: 'loading', quote: null })
    try {
      const quote = await window.api.skins.collectionQuote(id, currency)
      if (
        generation === accountGeneration &&
        get().selectedId === id &&
        get().currency === currency
      )
        set({ quote, quoteStatus: 'ready', notice: null })
    } catch (error) {
      if (
        generation === accountGeneration &&
        get().selectedId === id &&
        get().currency === currency
      )
        set({ quoteStatus: 'error', notice: errorNotice(error) })
    }
  },
  confirm: (confirmation) => set({ confirmation }),
  buy: async () => {
    const generation = accountGeneration
    const { selectedId: id, quote, request } = get()
    if (get().buying || !id || (!quote && request?.id !== id)) return
    const pending =
      request?.id === id
        ? request
        : {
            id,
            input: {
              currency: quote!.currency,
              quoteHash: quote!.quoteHash,
              requestKey: crypto.randomUUID()
            }
          }
    set({ buying: true, notice: null, request: pending })
    try {
      const result = await window.api.skins.collectionBuy(id, pending.input)
      if (generation !== accountGeneration) return
      balances(result)
      set({
        request: null,
        confirmation: false,
        quote: null,
        notice: 'success',
        detail: get().detail
          ? { ...get().detail!, items: get().detail!.items.map((i) => ({ ...i, owned: true })) }
          : null
      })
    } catch (error) {
      if (generation !== accountGeneration) return
      const notice = errorNotice(error)
      // Known rejection means no charge; transport uncertainty retains the key.
      set({
        notice,
        ...(notice !== 'error'
          ? { request: null, confirmation: false, quote: null, quoteStatus: 'error' as const }
          : {})
      })
    } finally {
      if (generation === accountGeneration) set({ buying: false })
    }
  },
  buyItem: async (id, currency) => {
    const generation = accountGeneration
    if (get().buying || get().request) return
    set({ buying: true, notice: null })
    try {
      const result = await window.api.skins.unlock(id, currency)
      if (generation !== accountGeneration) return
      balances(result)
      set({
        quote: null,
        detail: get().detail
          ? {
              ...get().detail!,
              items: get().detail!.items.map((i) => (i.id === id ? { ...i, owned: true } : i))
            }
          : null,
        notice: 'success'
      })
    } catch (error) {
      if (generation === accountGeneration) set({ notice: errorNotice(error) })
    } finally {
      if (generation === accountGeneration) {
        const notice = get().notice
        set({ buying: false })
        await get().refreshQuote()
        if (notice) set({ notice })
      }
    }
  }
}))

useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id === previous.session?.player.id) return
  accountGeneration++
  useCollectionsStore.setState({
    collections: [],
    selectedId: null,
    detail: null,
    quote: null,
    status: 'idle',
    quoteStatus: 'idle',
    buying: false,
    notice: null,
    confirmation: false,
    request: null
  })
})
