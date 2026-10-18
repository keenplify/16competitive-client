import { ModalDialog } from '../../components/ui/ModalDialog'
import { ProfilePopupNavigation } from './ProfilePopupNavigation'
import { useProfileModeLabel } from './useProfileModeLabel'
import { useEffect, useRef, useState, type JSX } from 'react'
import { LoaderCircle, UserPlus, UserRound } from 'lucide-react'
import { useMatchDetailsStore } from './match-details.store'
import { useProfileStore } from './profile.store'
import { useAuthStore } from '../auth/auth.store'
import { useFriendsStore } from '../friends/friends.store'
import { useTranslation } from '../i18n/i18n'
import { Button } from '../../components/ui/Button'

export function MatchDetailsOverlay(): JSX.Element | null {
  const { id, summary, status, close, open } = useMatchDetailsStore()
  const accountId = useAuthStore((state) => state.session?.player.id)
  const friends = useFriendsStore((state) => state.friends)
  const busy = useFriendsStore((state) => state.actingPlayerId)
  const { t } = useTranslation()
  const modeLabel = useProfileModeLabel()
  const menuButton = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [notice, setNotice] = useState<'sent' | 'error' | null>(null)

  useEffect(
    () =>
      useAuthStore.subscribe((state, previous) => {
        if (state.session?.player.id !== previous.session?.player.id) close()
      }),
    [close]
  )
  useEffect(() => {
    if (menu) menuButton.current?.focus()
  }, [menu])
  if (!id || !accountId) return null
  const dismiss = (): void => {
    setMenu(null)
    setNotice(null)
    close()
  }
  return (
    <>
      <ModalDialog
        open
        onClose={() => {
          if (menu) setMenu(null)
          else dismiss()
        }}
        className="fixed inset-0 m-auto max-h-[90vh] w-[min(1000px,94vw)] max-w-none overflow-y-auto rounded-none border border-white/15 bg-neutral-950 p-6 text-white backdrop:bg-black/80 sm:p-8"
        label={t('profile.matchDetails')}
        onClick={() => setMenu(null)}
      >
        <ProfilePopupNavigation
          className="mb-3"
          onBack={dismiss}
          onClose={() => {
            useProfileStore.getState().dismiss()
            dismiss()
          }}
        />
        <header className="flex items-center justify-between gap-4 border-b border-white/15 pb-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {summary?.mapId ?? t('profile.matchDetails')}
            </h2>
            <p className="mt-1 min-h-7 text-lg tabular-nums text-neutral-300">
              {summary ? `${modeLabel(summary.mode)} · ${summary.score}` : '—'}
            </p>
          </div>
        </header>
        <p className="min-h-8 py-1 text-sm text-neutral-300" role="status">
          {notice
            ? t(notice === 'sent' ? 'profile.friendSent' : 'profile.friendError')
            : t('profile.playerActionsHelp')}
        </p>
        {status === 'loading' ? (
          <div className="flex min-h-80 items-center justify-center" role="status">
            <LoaderCircle className="size-6 animate-spin" aria-label={t('profile.loading')} />
          </div>
        ) : status === 'error' ? (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4" role="alert">
            <p>{t('profile.matchError')}</p>
            <Button onClick={() => void open(id)}>{t('profile.retry')}</Button>
          </div>
        ) : (
          summary && (
            <div className="grid gap-6 md:grid-cols-2">
              {[...new Set(summary.players.map((player) => player.team))].map((team) => (
                <section key={team}>
                  <h3 className="mb-3 font-semibold">
                    {team === 'team_1'
                      ? t('profile.teamA')
                      : team === 'team_2'
                        ? t('profile.teamB')
                        : t('profile.players')}
                  </h3>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-white/15 px-3 py-2 text-xs text-neutral-300">
                    <span>{t('profile.players')}</span>
                    <span>
                      {t('profile.kills')} / {t('profile.assists')} / {t('profile.deaths')}
                    </span>
                  </div>
                  {summary.players
                    .filter((player) => player.team === team)
                    .map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-white/10 px-3 py-3 text-left text-sm hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-sky-300"
                        onClick={(event) => {
                          event.stopPropagation()
                          const rect = event.currentTarget.getBoundingClientRect()
                          setMenu({
                            id: player.id,
                            x: Math.min(rect.left, window.innerWidth - 208),
                            y: Math.min(rect.bottom, window.innerHeight - 112)
                          })
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setMenu({
                            id: player.id,
                            x: Math.max(8, Math.min(event.clientX, window.innerWidth - 208)),
                            y: Math.max(8, Math.min(event.clientY, window.innerHeight - 112))
                          })
                        }}
                      >
                        <span className="truncate font-medium">{player.username}</span>
                        <span className="tabular-nums text-neutral-300">
                          {player.kills} / {player.assists} / {player.deaths}
                        </span>
                      </button>
                    ))}
                </section>
              ))}
            </div>
          )
        )}
        {menu && (
          <div
            role="menu"
            aria-label={t('profile.playerActions')}
            className="fixed z-10 w-48 border border-white/20 bg-neutral-900 p-1 shadow-xl"
            style={{ left: menu.x, top: menu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={menuButton}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300"
              onClick={() => {
                const playerId = menu.id
                dismiss()
                useProfileStore.getState().openFromMatch(playerId, id)
              }}
            >
              <UserRound className="size-4" />
              {t('profile.view')}
            </button>
            {menu.id !== accountId && (
              <button
                type="button"
                role="menuitem"
                disabled={busy !== null || friends.some((friend) => friend.id === menu.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-50"
                onClick={() => {
                  const playerId = menu.id
                  setMenu(null)
                  void useFriendsStore
                    .getState()
                    .request(playerId)
                    .then(() => {
                      if (useMatchDetailsStore.getState().id === id)
                        setNotice(useFriendsStore.getState().error ? 'error' : 'sent')
                    })
                }}
              >
                <UserPlus className="size-4" />
                {t(
                  friends.some((friend) => friend.id === menu.id)
                    ? 'profile.alreadyFriends'
                    : 'profile.addFriend'
                )}
              </button>
            )}
          </div>
        )}
      </ModalDialog>
    </>
  )
}
