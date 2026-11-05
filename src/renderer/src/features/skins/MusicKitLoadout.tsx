import { useEffect, useId, type JSX } from 'react'
import { Headphones, LoaderCircle, Play, Square, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import {
  MUSIC_EVENTS,
  type MusicEvent,
  type MusicKit,
  type MusicTeam
} from '../../../../shared/music-kits'
import { useMusicKitsStore } from './music-kits.store'
import { useTranslation } from '../i18n/i18n'
import { Button } from '../../components/ui/Button'

export function MusicKitArtwork({
  kit,
  className
}: {
  kit?: MusicKit
  className?: string
}): JSX.Element {
  const discGradient = useId()
  return (
    <span className={twMerge('flex items-center justify-center overflow-hidden', className)}>
      {kit ? (
        <svg viewBox="0 0 280 200" className="size-full" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={discGradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#08090b" />
              <stop offset="0.32" stopColor="#30333a" />
              <stop offset="0.48" stopColor="#111216" />
              <stop offset="0.78" stopColor="#090a0c" />
              <stop offset="1" stopColor="#282a30" />
            </linearGradient>
          </defs>
          <circle cx="184" cy="100" r="89" fill={`url(#${discGradient})`} stroke="#45474e" />
          {[82, 78, 74, 70, 66, 62].map((radius) => (
            <circle
              key={radius}
              cx="184"
              cy="100"
              r={radius}
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.045"
            />
          ))}
          <circle cx="184" cy="100" r="28" fill="#191b20" stroke="#555861" strokeWidth="0.75" />
          <circle cx="184" cy="100" r="8" fill="#08090b" stroke="#6b6e76" />
          <path d="M12 14h184v180H12z" fill="#000" opacity="0.35" />
          <path d="M6 8h184v184H6z" fill="#16191f" stroke="#71747c" strokeWidth="1" />
          {kit.logoUrl ? (
            <image
              href={kit.logoUrl}
              x="7"
              y="9"
              width="182"
              height="182"
              preserveAspectRatio="xMidYMid meet"
            />
          ) : (
            <Headphones x="58" y="60" width="80" height="80" color="#b7c0cd" strokeWidth="1.25" />
          )}
          <path d="M7 9h5v182H7z" fill="#fff" opacity="0.08" />
        </svg>
      ) : (
        <Headphones className="size-7 text-neutral-300" aria-hidden="true" />
      )}
    </span>
  )
}

export function MusicKitSlot({
  team,
  disabled,
  onSelect,
  className
}: {
  team: MusicTeam
  disabled: boolean
  onSelect: () => void
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const snapshot = useMusicKitsStore((s) => s.snapshot)
  const pending = useMusicKitsStore((s) => s.pending)
  const status = useMusicKitsStore((s) => s.status)
  const selected = useMusicKitsStore((s) => s.filterTeam === team)
  const equip = useMusicKitsStore((s) => s.equip)
  const id = snapshot?.equipped[team]
  const kit = snapshot?.kits.find((k) => k.id === id)
  const title = `${t('music.item')}: ${kit ? kit.name : t('music.empty')}`
  return (
    <div className={twMerge('flex flex-col items-center gap-1.5', className)}>
      <div
        className={twMerge(
          'music-kit-slot relative size-16 shrink-0 border border-white/20 bg-black/35',
          selected && 'border-sky-300 ring-1 ring-sky-300'
        )}
      >
        <button
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={selected}
          onClick={onSelect}
          disabled={disabled}
          className="flex size-full items-center justify-center focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          {status === 'loading' && !snapshot ? (
            <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
          ) : (
            <MusicKitArtwork
              kit={kit}
              className={twMerge('size-12', id === null && 'opacity-40')}
            />
          )}
        </button>
        {id != null && (
          <button
            type="button"
            disabled={disabled || pending || status !== 'ready'}
            aria-label={t('music.clear', { team: team.toUpperCase() })}
            title={t('music.clear', { team: team.toUpperCase() })}
            onClick={() => {
              void equip(null, team)
            }}
            className="absolute right-0 bottom-0 flex size-5 items-center justify-center border border-white/30 bg-neutral-950 text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-50"
          >
            {pending ? (
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <X className="size-3" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      <span className="text-center text-[10px] font-bold text-neutral-300">{t('music.item')}</span>
    </div>
  )
}

export function MusicKitInventory({
  team,
  disabled,
  className
}: {
  team: MusicTeam
  disabled: boolean
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const state = useMusicKitsStore()
  useEffect(() => () => useMusicKitsStore.getState().stopPreview(), [])
  const kits = state.snapshot?.kits.filter((k) => state.snapshot!.ownedIds.includes(k.id)) ?? []
  return (
    <section
      className={twMerge('mt-4', className)}
      aria-label={t('music.title')}
      aria-busy={state.status === 'loading'}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-300">{t('music.nextMatch')}</p>
        <label className="flex items-center gap-2 text-sm">
          {t('music.event')}
          <select
            value={state.event}
            onChange={(e) => state.setEvent(e.target.value as MusicEvent)}
            className="h-8 rounded-none border border-white/20 bg-neutral-900 px-2"
          >
            {MUSIC_EVENTS.map((e) => (
              <option key={e} value={e}>
                {t(`music.${e}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex min-h-52 flex-wrap items-start gap-3">
        {kits.map((kit) => {
          const equipped = state.snapshot!.equipped[team] === kit.id
          return (
            <article
              key={kit.id}
              className={twMerge(
                'music-kit-card flex w-44 flex-col border border-white/15 bg-black/25 p-2',
                equipped && 'border-sky-300 bg-sky-300/10'
              )}
            >
              <button
                type="button"
                disabled={disabled || state.pending || state.status !== 'ready'}
                aria-pressed={equipped}
                title={t('music.equipTeam', { team: team.toUpperCase(), name: kit.name })}
                onClick={() => void state.equip(kit.id, team)}
                className="flex w-full flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                <MusicKitArtwork kit={kit} className="h-28 w-full" />
                <span className="min-h-10 w-full break-words text-center text-sm font-bold">
                  {kit.name}
                </span>
              </button>
              <Button
                variant="ghost"
                className="h-8 gap-2 px-1 text-xs"
                onClick={() => void state.preview(kit.id)}
              >
                {state.playingId === kit.id ? (
                  <Square className="size-3" aria-hidden="true" />
                ) : (
                  <Play className="size-3" aria-hidden="true" />
                )}
                {t(state.playingId === kit.id ? 'music.stop' : 'music.preview')}
              </Button>
            </article>
          )
        })}
        {!state.snapshot && (
          <p className="py-8 text-sm text-neutral-300">
            {t(state.status === 'error' ? 'music.error' : 'music.loading')}
          </p>
        )}
      </div>
      <div className="flex min-h-10 items-center justify-between gap-3">
        <p role="status" className="text-sm text-rose-200">
          {state.error ? t(state.error) : ''}
        </p>
        {state.status === 'error' && (
          <Button variant="ghost" onClick={() => void state.load()}>
            {t('music.retry')}
          </Button>
        )}
      </div>
    </section>
  )
}
