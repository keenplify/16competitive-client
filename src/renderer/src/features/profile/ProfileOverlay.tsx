import { ModalDialog } from '../../components/ui/ModalDialog'
import { useMatchDetailsStore } from './match-details.store'
import { useEffect, type JSX } from 'react'
import { ProfilePage } from './ProfilePage'
import { useProfileStore } from './profile.store'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { ProfilePopupNavigation } from './ProfilePopupNavigation'

export function ProfileOverlay(): JSX.Element | null {
  const matchId = useMatchDetailsStore((state) => state.id)
  const playerId = useProfileStore((state) => state.selectedId)
  const close = useProfileStore((state) => state.close)
  const accountId = useAuthStore((state) => state.session?.player.id)
  const { t } = useTranslation()
  useEffect(
    () =>
      useAuthStore.subscribe((state, previous) => {
        if (state.session?.player.id !== previous.session?.player.id)
          useProfileStore.getState().reset()
      }),
    []
  )

  if (!playerId || !accountId || matchId) return null
  return (
    <>
      <ModalDialog
        open
        onClose={close}
        className="fixed inset-0 m-auto max-h-[94vh] w-[min(1100px,94vw)] max-w-none overflow-y-auto rounded-none border border-white/15 bg-neutral-950 p-0 text-white backdrop:bg-black/80"
        label={t('profile.title')}
        vguiNavigation={{
          backLabel: t('profile.back'),
          onBack: close,
          onClose: () => useProfileStore.getState().dismiss()
        }}
      >
        <ProfilePopupNavigation
          className="sticky top-0 z-10 border-b border-white/10 bg-neutral-950 px-6 py-3"
          onBack={close}
          onClose={() => useProfileStore.getState().dismiss()}
        />
        <ProfilePage key={playerId} playerId={playerId} />
      </ModalDialog>
    </>
  )
}
