import { useEffect, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import { useAuthStore } from '../auth/auth.store'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useTranslation } from '../i18n/i18n'
import { useRewardInbox } from './reward-inbox.store'
import { usePaymentsStore } from '../skins/payments.store'
import { RewardReveal } from './RewardReveal'
import translations from './reward-translations.json'

export function RewardInboxController(): JSX.Element | null {
  const account = useAuthStore((state) =>
    state.status === 'authenticated' && !state.session?.player.requiresUsernameSetup
      ? (state.session?.player.id ?? null)
      : null
  )
  const page = useNavigationStore((state) => state.page)
  const queue = useMatchmakingStore((state) => state.queueStatus)
  const completed = useMatchmakingStore((state) => state.completedMatch)
  const owner = useRewardInbox((state) => state.owner)
  const receipts = useRewardInbox((state) => state.receipts)
  const busy = useRewardInbox((state) => state.consuming)
  const { language } = useTranslation()
  const text = translations[language]
  const [surface, setSurface] = useState<'blocked' | 'checkout' | 'clear'>('blocked')
  const paymentBusy = usePaymentsStore((state) => state.busy)
  const topUp = receipts[0]?.type === 'P_CASH' && receipts[0]?.itemId === 'TOP_UP'
  const safe =
    account !== null &&
    queue === 'idle' &&
    (page === 'lobby' || page === 'play' || page === 'store' || completed !== null)

  useEffect(() => {
    useRewardInbox.getState().setOwner(account)
  }, [account])
  useEffect(() => {
    // Modal focus belongs to one dialog at a time. Also defer when the game has
    // focus: the receipt must be visible to the player, not consumed behind it.
    const check = (): void => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        setSurface('blocked')
        return
      }
      const dialogs = Array.from(
        document.querySelectorAll('dialog[open]:not([aria-labelledby="reward-reveal-title"])')
      )
      if (!dialogs.length) setSurface('clear')
      else if (
        dialogs.every((dialog) => dialog.getAttribute('aria-labelledby') === 'p-cash-top-up-title')
      )
        setSurface('checkout')
      else setSurface('blocked')
    }
    check()
    const timer = window.setInterval(check, 500)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  useEffect(() => {
    if (!safe || surface === 'blocked' || account !== owner) return
    const load = (): void => {
      void useRewardInbox
        .getState()
        .load(surface === 'checkout' || page === 'store')
        .catch((error) => console.warn('[Rewards] Pending rewards remain on server', error))
    }
    // Allow all match settlements to commit before collecting their combined total.
    const initial = window.setTimeout(load, 1200)
    const interval = window.setInterval(load, 15_000)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [safe, surface, page, account, owner, completed, receipts.length])

  useEffect(() => {
    if (safe && account === owner && surface === 'checkout' && topUp && !paymentBusy) {
      usePaymentsStore.getState().close()
    }
  }, [safe, account, owner, surface, topUp, paymentBusy])

  if (!account || account !== owner || receipts.length === 0) return null
  const consume = (): void => {
    if (useRewardInbox.getState().consuming) return
    const feedback = toast.loading(text.saving)
    void useRewardInbox
      .getState()
      .consume()
      .then(() => {
        if (useRewardInbox.getState().owner !== account) {
          toast.dismiss(feedback)
          return
        }
        toast.update(feedback, {
          render: text.success,
          type: 'success',
          isLoading: false,
          autoClose: 2500
        })
        void useAuthStore.getState().refreshSession()
      })
      .catch(() => {
        toast.update(feedback, {
          render: text.failed,
          type: 'error',
          isLoading: false,
          autoClose: 6000
        })
      })
  }
  return (
    <RewardReveal
      key={receipts[0].id}
      active={safe && surface === 'clear' && (page !== 'store' || topUp)}
      receipts={receipts}
      busy={busy}
      onContinue={consume}
    />
  )
}
