import { useMatchDetailsStore } from './match-details.store'
import { useEffect, useRef, type JSX } from 'react'
import { ProfilePage } from './ProfilePage'
import { useProfileStore } from './profile.store'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { ProfilePopupNavigation } from './ProfilePopupNavigation'
import { ModalPortal } from '../../components/ui/ModalPortal'

export function ProfileOverlay(): JSX.Element | null {
  const matchId = useMatchDetailsStore((state) => state.id)
  const playerId = useProfileStore((state) => state.selectedId)
  const close = useProfileStore((state) => state.close)
  const accountId = useAuthStore((state) => state.session?.player.id)
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(
    () =>
      useAuthStore.subscribe((state, previous) => {
        if (state.session?.player.id !== previous.session?.player.id)
          useProfileStore.getState().reset()
      }),
    []
  )
  useEffect(() => {
    if (playerId && !matchId) dialog.current?.showModal()
  }, [playerId, matchId])
  if (!playerId || !accountId || matchId) return null
  return (
    <ModalPortal>
      <dialog
        ref={dialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        aria-label={t('profile.title')}
        className="fixed inset-0 m-auto max-h-[90vh] w-[min(1100px,94vw)] max-w-none overflow-y-auto rounded-none border border-white/15 bg-neutral-950 p-0 text-white backdrop:bg-black/80"
      >
        <ProfilePopupNavigation
          className="sticky top-0 z-10 border-b border-white/10 bg-neutral-950 px-6 py-3"
          onBack={close}
          onClose={() => useProfileStore.getState().dismiss()}
        />
        <ProfilePage key={playerId} playerId={playerId} />
      </dialog>
    </ModalPortal>
  )
}
