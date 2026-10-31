import { type JSX } from 'react'
import { Check, Headphones, LoaderCircle, Play, Square } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { MUSIC_EVENTS, type MusicEvent, type MusicKit } from '../../../../shared/music-kits'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { useMusicKitsStore } from './music-kits.store'
import { MusicKitArtwork } from './MusicKitLoadout'

export function MusicKitStoreCard({
  kit,
  owned,
  equipped,
  pending,
  playing,
  event,
  onEvent,
  onPreview,
  onBuy,
  onEquip,
  className
}: {
  kit: MusicKit
  owned: boolean
  equipped: boolean
  pending: boolean
  playing: boolean
  event: MusicEvent
  onEvent: (event: MusicEvent) => void
  onPreview: () => void
  onBuy: () => void
  onEquip: () => void
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <article
      className={twMerge(
        'music-store-card flex min-h-72 min-w-0 flex-col border border-white/10 bg-neutral-900/90 p-5',
        className
      )}
    >
      <MusicKitArtwork
        kit={kit}
        className="weapon-preview-well mb-4 h-40 w-full border border-white/10 bg-neutral-950/70 p-3"
      />
      <p className="flex items-center gap-2 text-xs font-bold text-sky-400">
        <Headphones className="size-4" aria-hidden="true" />
        {t('music.item')}
      </p>
      <h2 className="mt-2 break-words text-xl font-semibold">
        {kit.id === 'quake' ? t('music.default') : kit.name}
      </h2>
      <div className="mt-3 flex-1">
        <SelectField
          label={t('music.event')}
          aria-label={t('music.event')}
          value={event}
          onChange={(e) => onEvent(e.target.value as MusicEvent)}
          className="h-8 min-w-0 text-xs"
        >
          {MUSIC_EVENTS.map((value) => (
            <option key={value} value={value}>
              {t(`music.${value}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="mt-3 flex min-h-6 items-center justify-between gap-2 text-sm">
        {owned ? (
          <span className="text-emerald-300">{t(equipped ? 'music.equipped' : 'music.owned')}</span>
        ) : kit.pricePoints === 0 ? (
          t('music.free')
        ) : (
          <CurrencyAmount currency="POINTS" amount={kit.pricePoints} />
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          className="h-9 min-w-0 gap-2 px-2 text-xs"
          aria-label={`${t(playing ? 'music.stop' : 'music.preview')}: ${kit.name}`}
          onClick={onPreview}
        >
          {playing ? (
            <Square className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Play className="size-4 shrink-0" aria-hidden="true" />
          )}
          {t(playing ? 'music.stop' : 'music.preview')}
        </Button>
        <Button
          variant={owned ? 'ghost' : 'secondary'}
          className="h-9 min-w-0 gap-2 px-2 text-xs"
          disabled={pending || equipped}
          onClick={owned ? onEquip : onBuy}
        >
          {pending ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : equipped ? (
            <Check className="size-4 shrink-0" aria-hidden="true" />
          ) : null}
          {t(equipped ? 'music.equipped' : owned ? 'music.equip' : 'music.buy')}
        </Button>
      </div>
    </article>
  )
}

export function MusicKitPurchaseDialog(): JSX.Element {
  const { t } = useTranslation()
  const state = useMusicKitsStore()
  const points = useAuthStore((s) => s.session?.player.points ?? 0)
  return (
    <ModalDialog
      open={Boolean(state.confirm)}
      onClose={() => {
        if (!state.pending) state.choosePurchase(null)
      }}
      labelledBy="music-purchase-title"
      className="w-[calc(100%-2rem)] max-w-md border border-white/15 bg-neutral-950 p-5 text-white"
    >
      <h2 id="music-purchase-title" className="text-xl font-semibold">
        {t('music.title')}
      </h2>
      <p className="mt-4 break-words">
        {state.confirm
          ? t('music.confirm', { name: state.confirm.name, price: state.confirm.pricePoints })
          : ''}
      </p>
      <p className="mt-2 text-sm text-neutral-300">{t('music.nextMatch')}</p>
      <p role="status" className="mt-3 min-h-12 text-sm text-rose-200">
        {state.error
          ? t(state.error)
          : state.confirm && points < state.confirm.pricePoints
            ? t('music.insufficient')
            : ''}
      </p>
      <div className="mt-3 flex justify-end gap-3">
        <Button variant="ghost" disabled={state.pending} onClick={() => state.choosePurchase(null)}>
          {t('music.cancel')}
        </Button>
        <Button
          className="w-32 gap-2"
          disabled={state.pending || !state.confirm || points < state.confirm.pricePoints}
          onClick={() => void state.buy()}
        >
          {state.pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {t('music.buy')}
        </Button>
      </div>
    </ModalDialog>
  )
}
