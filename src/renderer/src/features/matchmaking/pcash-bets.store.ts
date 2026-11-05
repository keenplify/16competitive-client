import { usePaymentsStore } from '../skins/payments.store'
import { create } from 'zustand'
import { toast } from 'react-toastify'
import { validateBetInput, type PCashBetSnapshot } from '../../../../shared/pcash-bets'
import { translate, useLanguageStore } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'

interface BetState {
  ownerId: string | null
  matchId: string | null
  snapshot: PCashBetSnapshot | null
  amount: string
  loading: boolean
  busy: boolean
  error: boolean
  setAmount: (amount: string) => void
  load: (matchId: string, feedback?: boolean) => Promise<void>
  place: () => Promise<boolean>
}
const t = (
  key: Parameters<typeof translate>[1],
  values?: Record<string, string | number>
): string => translate(useLanguageStore.getState().language, key, values)
const owner = (): string | null => useAuthStore.getState().session?.player.id ?? null
export const usePCashBetsStore = create<BetState>((set, get) => ({
  ownerId: null,
  matchId: null,
  snapshot: null,
  amount: '0',
  loading: false,
  busy: false,
  error: false,
  setAmount: (amount) => set({ amount }),
  load: async (matchId, feedback = false) => {
    if (get().busy || get().loading) return
    const ownerId = owner()
    if (!ownerId) return
    const same = get().ownerId === ownerId && get().matchId === matchId
    set({
      ownerId,
      matchId,
      loading: true,
      error: false,
      ...(!same ? { snapshot: null, amount: '0' } : {})
    })
    const notice = feedback ? toast.loading(t('bet.loading')) : null
    try {
      const snapshot = await window.api.pCashBets.get(matchId)
      if (owner() !== ownerId || get().matchId !== matchId) return
      set({
        snapshot,
        amount: snapshot.bet ? String(snapshot.bet.stake) : !snapshot.enabled ? '0' : get().amount,
        loading: false
      })
      usePaymentsStore.setState((state) =>
        state.ownerId === ownerId && state.snapshot
          ? { snapshot: { ...state.snapshot, pCash: snapshot.balance } }
          : {}
      )
      if (notice !== null)
        toast.update(notice, {
          render: t('bet.balance', { amount: snapshot.balance }),
          type: 'success',
          isLoading: false,
          autoClose: 4000
        })
    } catch {
      if (owner() === ownerId && get().matchId === matchId) set({ loading: false, error: true })
      if (notice !== null)
        toast.update(notice, {
          render: t('bet.loadError'),
          type: 'error',
          isLoading: false,
          autoClose: 6000
        })
    } finally {
      if ((owner() !== ownerId || get().matchId !== matchId) && notice !== null)
        toast.dismiss(notice)
    }
  },
  place: async () => {
    const { snapshot, amount, matchId, busy, ownerId } = get()
    if (!snapshot || !matchId || busy || owner() !== ownerId) return false
    const input = {
      stake: Number(amount),
      partnerBps: snapshot.partnerBps,
      platformBps: snapshot.platformBps
    }
    const notice = toast.loading(t('bet.processing'))
    set({ busy: true })
    try {
      validateBetInput(input)
      const next = await window.api.pCashBets.place(matchId, input)
      if (owner() !== ownerId || get().matchId !== matchId) {
        toast.dismiss(notice)
        return false
      }
      set({ snapshot: next, error: false })
      usePaymentsStore.setState((state) =>
        state.ownerId === ownerId && state.snapshot
          ? { snapshot: { ...state.snapshot, pCash: next.balance } }
          : {}
      )
      toast.update(notice, {
        render: t('bet.placed'),
        type: 'success',
        isLoading: false,
        autoClose: 5000
      })
      return true
    } catch (error) {
      const next = await window.api.pCashBets.get(matchId).catch(() => null)
      if (owner() !== ownerId || get().matchId !== matchId) {
        toast.dismiss(notice)
        return false
      }
      if (next) {
        set({ snapshot: next })
        usePaymentsStore.setState(state => state.ownerId === ownerId && state.snapshot ? { snapshot: { ...state.snapshot, pCash: next.balance } } : {})
      }
      const confirmed = next?.bet?.stake === input.stake
      const message = error instanceof Error ? error.message : ''
      const key = message.includes('BET_INSUFFICIENT_PCASH')
        ? 'bet.insufficient'
        : message.includes('BET_TERMS_CHANGED')
          ? 'bet.termsChanged'
          : message.includes('BET_ALREADY_PLACED')
            ? 'bet.alreadyPlaced'
            : message.includes('INVALID_BET')
              ? 'bet.invalid'
              : message.includes('BET_CLOSED')
                ? 'bet.closed'
                : message.includes('BET_COMMUNITY_DISABLED')
                  ? 'bet.unavailable'
                  : 'bet.loadError'
      toast.update(notice, {
        render: t(confirmed ? 'bet.placed' : key),
        type: confirmed ? 'success' : 'error',
        isLoading: false,
        autoClose: 7000
      })
      return confirmed
    } finally {
      if (get().ownerId === ownerId && get().matchId === matchId) set({ busy: false })
    }
  }
}))

useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id !== previous.session?.player.id)
    usePCashBetsStore.setState({
      ownerId: null,
      matchId: null,
      snapshot: null,
      amount: '0',
      loading: false,
      busy: false,
      error: false
    })
})
