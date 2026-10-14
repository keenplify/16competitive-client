import { useEffect, useRef } from 'react'
import { LoaderCircle, Users } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useCommunityMembershipStore } from './community-membership.store'
export function CommunityTransferPrompt({
  onAnswered,
  className
}: {
  onAnswered?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const pending = useCommunityMembershipStore((state) => state.pending),
    busy = useCommunityMembershipStore((state) => state.deciding),
    error = useCommunityMembershipStore((state) => state.error),
    decide = useCommunityMembershipStore((state) => state.decide)
  const answer = async (accept: boolean) => {
    if (await decide(accept)) onAnswered?.()
  }
  if (!pending) return null
  return (
    <section className={twMerge('space-y-5', className)} aria-labelledby="community-transfer-title">
      <Users className="size-8 text-sky-300" aria-hidden="true" />
      <h2 id="community-transfer-title" className="text-xl font-semibold text-white">
        {t('community.transferQuestion', { community: pending.name })}
      </h2>
      <p className="text-sm leading-6 text-neutral-300">{t('community.transferDescription')}</p>
      <p className="text-sm leading-6 text-neutral-400">{t('community.transferKeep')}</p>
      <div className="h-20 overflow-y-auto text-sm text-red-300" role="status" aria-live="polite">
        {error ? t('community.transferError') : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          className="h-11 gap-2"
          disabled={busy}
          onClick={() => void answer(false)}
        >
          {t('community.no')}
        </Button>
        <Button className="h-11 gap-2" disabled={busy} onClick={() => void answer(true)}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <span className="size-4" aria-hidden="true" />
          )}
          {t('community.yes')}
        </Button>
      </div>
    </section>
  )
}
export function CommunityTransferDialog() {
  const accountId = useAuthStore((state) => state.session?.player.id),
    pending = useCommunityMembershipStore((state) => state.pending),
    loadedAccount = useCommunityMembershipStore((state) => state.accountId)
  const page = useNavigationStore((state) => state.page),
    queue = useMatchmakingStore((state) => state.queueStatus)
  if (
    !pending ||
    accountId !== loadedAccount ||
    (page !== 'lobby' && page !== 'play' && page !== 'settings') ||
    queue !== 'idle'
  )
    return null
  return <TransferModal key={pending.id} />
}
function TransferModal() {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <ModalPortal>
      <dialog
        ref={ref}
        onCancel={(event) => event.preventDefault()}
        aria-labelledby="community-transfer-title"
        className="m-auto max-h-[90vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-none border border-white/15 bg-neutral-900 p-6 text-white shadow-2xl backdrop:bg-neutral-950/85"
      >
        <CommunityTransferPrompt />
      </dialog>
    </ModalPortal>
  )
}
