import { Info, UserRound } from 'lucide-react'
import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { QueuedPlayer } from '../../../../shared/matchmaking'
import dust2Preview from '../../assets/dust2.jpg'
import { Button } from '../../components/ui/Button'
import { AssetPreparation, MatchAssetPreparation } from './MatchAssetPreparation'

interface MatchFoundReadyCheckProps {
  acceptedPlayerIds: string[]
  match: {
    mapId: string
    mode: string
    teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
  }
  playersRequired: number
  readyResponse: 'pending' | 'sending' | 'accepted' | 'declined'
  secondsRemaining: number
  assetPreparation: AssetPreparation
  onAccept: () => void
  onDecline: () => void
}

function ReadyPlayer({ player, ready }: { player: QueuedPlayer; ready: boolean }): JSX.Element {
  return (
    <div
      className={twMerge(
        'group relative flex aspect-square w-12 items-center justify-center border-2 sm:w-14',
        ready
          ? 'border-emerald-300 bg-emerald-400/25 text-white shadow-[0_0_0_3px_rgba(34,197,94,0.18),0_0_18px_rgba(34,197,94,0.65)]'
          : 'border-white/10 bg-black/45 text-white/20'
      )}
      aria-label={`${player.username}: ${ready ? 'ready' : 'pending'}`}
      title={`${player.username} · ${ready ? 'Ready' : 'Pending'}`}
    >
      <UserRound className="size-7 fill-current sm:size-8" strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">{player.username}</span>
    </div>
  )
}

export function MatchFoundReadyCheck({
  acceptedPlayerIds,
  match,
  playersRequired,
  readyResponse,
  secondsRemaining,
  assetPreparation,
  onAccept,
  onDecline
}: MatchFoundReadyCheckProps): JSX.Element {
  const players = [...match.teams.teamA, ...match.teams.teamB]
  const mapName = match.mapId.replace(/^de_/, '').replace(/_/g, ' ')
  const mapDisplayName = mapName.replace(/\b\w/g, (letter) => letter.toUpperCase())

  return (
    <main className="relative isolate flex min-h-[calc(100vh-5rem)] items-center justify-center overflow-hidden bg-[#111820] px-5 py-12 text-white">
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center opacity-35 blur-[5px] scale-110"
        style={{ backgroundImage: `url(${dust2Preview})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 -z-10 bg-slate-950/55" aria-hidden="true" />

      <div className="w-full max-w-[46rem]">
        <section className="border-4 border-emerald-400 bg-[linear-gradient(110deg,rgba(3,51,25,0.92),rgba(3,28,20,0.88))] p-6 shadow-[0_0_0_3px_rgba(34,197,94,0.2),0_16px_45px_rgba(0,0,0,0.6),inset_0_0_45px_rgba(0,0,0,0.45)] sm:p-9">
          <header className="text-center">
            <h1 className="inline-block border-b border-emerald-300/70 pb-1 text-2xl font-light tracking-wide text-emerald-200 sm:text-3xl">
              YOUR MATCH IS READY!
            </h1>
            <p className="mt-3 text-sm font-medium text-emerald-200/85">
              Competitive · {mapDisplayName} · {match.mode}
            </p>
          </header>

          <MatchAssetPreparation className="mt-6" preparation={assetPreparation} />

          <div
            className="mt-8 flex flex-wrap justify-center gap-2.5 sm:gap-3"
            role="list"
            aria-label="Player ready status"
          >
            {players.map((player) => (
              <ReadyPlayer
                key={player.id}
                player={player}
                ready={acceptedPlayerIds.includes(player.id)}
              />
            ))}
          </div>

          <p className="mt-4 text-center text-sm font-medium text-emerald-200">
            {acceptedPlayerIds.length} / {playersRequired} Players Ready
          </p>

          <div className="mt-6 text-center">
            <p className="font-mono text-3xl font-bold tabular-nums text-emerald-200">
              {secondsRemaining}
            </p>
            <p className="mt-1 text-xs tracking-[0.14em] text-emerald-100/65 uppercase">
              seconds to accept
            </p>
          </div>

          <div className="mt-7 flex justify-center gap-3">
            <Button
              className="min-w-40 rounded-none bg-emerald-400 text-base font-extrabold text-emerald-950 shadow-[0_4px_0_rgb(5,100,55)] hover:bg-emerald-300 disabled:bg-emerald-400/50"
              disabled={readyResponse !== 'pending'}
              onClick={onAccept}
            >
              {readyResponse === 'accepted'
                ? 'ACCEPTED'
                : readyResponse === 'sending'
                  ? 'SENDING…'
                  : 'ACCEPT'}
            </Button>
            <Button
              className="rounded-none border border-white/15 px-6 text-white/65 hover:border-white/35"
              variant="ghost"
              disabled={readyResponse !== 'pending'}
              onClick={onDecline}
            >
              DECLINE
            </Button>
          </div>
        </section>

        <aside className="mt-5 flex gap-4 bg-black/85 px-5 py-4 text-xs leading-relaxed text-white/80 shadow-xl sm:px-6">
          <Info className="mt-0.5 size-5 shrink-0 text-white" aria-hidden="true" />
          <p>
            By accepting, you commit to this competitive match. Leaving after acceptance may result
            in a penalty. Please ensure you are ready to play before continuing.
          </p>
        </aside>
      </div>
    </main>
  )
}
