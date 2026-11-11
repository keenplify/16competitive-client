import { useEffect, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import { useAuthStore } from '../auth/auth.store'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useTranslation } from '../i18n/i18n'
import { useRewardInbox } from './reward-inbox.store'
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
  const [unobstructed, setUnobstructed] = useState(false)
  const safe =
    account !== null &&
    queue === 'idle' &&
    (page === 'lobby' || page === 'play' || completed !== null)

  useEffect(() => {
    useRewardInbox.getState().setOwner(account)
  }, [account])
  useEffect(() => {
    // Modal focus belongs to one dialog at a time. Also defer when the game has
    // focus: the receipt must be visible to the player, not consumed behind it.
    const check = (): void =>
      setUnobstructed(
        document.visibilityState === 'visible' &&
          document.hasFocus() &&
          !document.querySelector('dialog[open]:not([aria-labelledby="reward-reveal-title"])')
      )
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
    if (!safe || !unobstructed || account !== owner) return
    const load = (): void => {
      void useRewardInbox
        .getState()
        .load()
        .catch((error) => console.warn('[Rewards] Pending rewards remain on server', error))
    }
    // Allow all match settlements to commit before collecting their combined total.
    const initial = window.setTimeout(load, 1200)
    const interval = window.setInterval(load, 15_000)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [safe, unobstructed, account, owner, completed, receipts.length])

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
      active={safe && unobstructed}
      receipts={receipts}
      busy={busy}
      onContinue={consume}
    />
  )
}
