import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { PartyMember } from '../../../../shared/party'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'

const PLAYER_MODELS = [
  'player/arctic/arctic.mdl',
  'player/gign/gign.mdl',
  'player/gsg9/gsg9.mdl',
  'player/guerilla/guerilla.mdl',
  'player/leet/leet.mdl',
  'player/sas/sas.mdl',
  'player/terror/terror.mdl',
  'player/urban/urban.mdl'
] as const

const modelForSlot = (slot: number, member: PartyMember | null): string => {
  const seed = member?.id ?? `open-slot-${slot}`
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return PLAYER_MODELS[Math.abs(hash + slot * 17) % PLAYER_MODELS.length]
}

interface PartyPlayerSlotProps {
  slot: number
  member: PartyMember
  isLeader: boolean
  isCurrentPlayer: boolean
  className?: string
}

export function PartyPlayerSlot({
  slot,
  member,
  isLeader,
  isCurrentPlayer,
  className
}: PartyPlayerSlotProps): JSX.Element {
  return (
    <article
      className={twMerge(
        'group relative min-h-80 w-full flex-none overflow-hidden sm:w-1/2 md:w-1/3 lg:min-h-0 lg:w-1/5',
        className
      )}
    >
      <ModelViewer
        modelPath={modelForSlot(slot, member)}
        animation="idle1"
        maxFrameRate={30}
        cameraLocked
        className="absolute inset-0"
      />
      <footer className="absolute bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-52 -translate-x-1/2 rounded-lg border border-white/15 bg-neutral-950/80 px-3 py-2.5 text-center shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="flex items-center justify-center gap-2">
          <p className="truncate text-sm font-semibold">{member.username}</p>
          {isLeader && (
            <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-300 uppercase">
              Leader
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[10px] tracking-wide text-neutral-500 uppercase">
          {member.mmr} MMR{isCurrentPlayer ? ' · You' : ''}
        </p>
      </footer>
    </article>
  )
}
