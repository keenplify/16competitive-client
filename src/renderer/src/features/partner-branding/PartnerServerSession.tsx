import type { JSX } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import type { PartnerPresence } from '../../../../shared/partner-community'
import { Button } from '../../components/ui/Button'
import { FindMatchButton } from '../matchmaking/FindMatchButton'
import { MatchSessionBackdrop } from '../matchmaking/MatchSessionBackdrop'
import { localMapPreviews } from '../matchmaking/map-previews'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useCustomGamesStore } from '../matchmaking/custom-games.store'
import { PlayerVoiceControls } from '../voice/PlayerVoiceControls'
import { usePartnerPresenceStore } from './partner-presence.store'
import { usePartnerLaunchText } from './partner-launch-copy'
import { usePartnerSessionText } from './partner-session-copy'
import { useCommunityText } from './community-copy'

export function PartnerServerSession({
  presence,
  currentPlayerId
}: {
  presence: PartnerPresence
  currentPlayerId: string
}): JSX.Element {
  const text = usePartnerSessionText()
  const launchText = usePartnerLaunchText()
  const communityText = useCommunityText()
  const { launching, launchError, reconnect, dismissSession } = usePartnerPresenceStore()
  const registered = useMatchmakingStore(
    (state) => state.maps.find((map) => map.id === presence.map)?.previewUrl
  )
  const bundled =
    presence.map && Object.hasOwn(localMapPreviews, presence.map)
      ? localMapPreviews[presence.map]
      : undefined
  return (
    <main
      data-match-session="partner"
      className="relative flex h-full min-h-0 flex-col items-center overflow-y-auto bg-transparent px-5 py-5 text-white sm:px-10 sm:py-10"
    >
      <MatchSessionBackdrop
        previewUrl={presence.server.imageUrl || registered || bundled}
        fallbackPreviewUrl={bundled}
      />
      <div className="relative z-10 my-auto w-full max-w-5xl shrink-0">
        <div className="text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase">
            {launchText('inGame')}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{presence.server.name}</h1>
          <p className="mt-2 min-h-5 text-sm text-neutral-300">{presence.map ?? ''}</p>
        </div>
        <section className="mt-6 border border-white/10 bg-neutral-900/90 p-4">
          <h2 className="mb-3 text-xs font-bold tracking-[0.18em] text-neutral-400 uppercase">
            {text('players')}
          </h2>
          <ul className="h-80 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
            {!presence.players?.length && (
              <li className="p-3 text-sm text-neutral-400">{text('empty')}</li>
            )}
            {presence.players?.map((player) => (
              <li
                key={player.id}
                className="flex min-h-12 flex-wrap items-center gap-3 bg-black/25 px-3 py-1.5"
              >
                <span
                  className="min-w-24 flex-1 truncate text-left text-sm font-medium"
                  title={player.username}
                >
                  {player.username}
                </span>
                {player.id !== currentPlayerId && presence.voiceMode !== 'off' && (
                  <PlayerVoiceControls playerId={player.id} username={player.username} />
                )}
              </li>
            ))}
          </ul>
        </section>
        <div className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-3">
          <Button
            variant="secondary"
            className="w-full gap-2"
            onClick={() => {
              useCustomGamesStore.getState().setPlayView('partner')
              dismissSession()
            }}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {text('back')}
          </Button>
          <FindMatchButton
            className="h-11 w-full min-w-0 px-4 text-sm font-semibold tracking-normal normal-case"
            disabled={launching}
            aria-busy={launching}
            onClick={() => void reconnect()}
          >
            {launching && (
              <LoaderCircle className="absolute left-2 size-4 animate-spin" aria-hidden="true" />
            )}
            <span className="relative z-10">{text('launch')}</span>
          </FindMatchButton>
          <p className="min-h-10 text-sm text-red-300" role={launchError ? 'alert' : undefined}>
            {launchError ? communityText('launchFailed') : ''}
          </p>
          <p className="text-xs leading-5 text-neutral-300">{text('hint')}</p>
        </div>
      </div>
    </main>
  )
}
