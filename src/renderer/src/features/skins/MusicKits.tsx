import { useEffect, type JSX } from 'react'
import { Check, Headphones, LoaderCircle, Play, Square, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { MUSIC_EVENTS, type MusicEvent } from '../../../../shared/music-kits'
import { Button } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { useMusicKitsStore } from './music-kits.store'

export function MusicKits({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const state = useMusicKitsStore()
  const points = useAuthStore((s) => s.session?.player.points ?? 0)
  useEffect(() => () => useMusicKitsStore.getState().close(), [])
  return (
    <>
      <Button
        variant="secondary"
        className={twMerge('gap-2 rounded-none', className)}
        onClick={state.show}
      >
        <Headphones className="size-4" aria-hidden="true" />
        {t('music.title')}
      </Button>
      <ModalDialog
        open={state.open}
        onClose={state.close}
        labelledBy="music-kits-title"
        className="w-[calc(100%-2rem)] max-w-3xl rounded-none border border-white/15 bg-neutral-950 p-5 text-white"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="music-kits-title" className="text-2xl font-semibold">
            {t('music.title')}
          </h2>
          <Button
            variant="ghost"
            className="size-9 shrink-0 px-0"
            disabled={state.pending}
            onClick={state.close}
            aria-label={t('icafe.close')}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-2 max-w-prose text-sm text-neutral-300">{t('music.description')}</p>
        <p className="mt-2 text-sm text-amber-200">{t('music.nextMatch')}</p>
        <div className="my-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3 text-sm">
            {t('music.event')}
            <select
              value={state.event}
              onChange={(e) => state.setEvent(e.target.value as MusicEvent)}
              className="h-10 max-w-52 rounded-none border border-white/20 bg-neutral-900 px-2 focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              {MUSIC_EVENTS.map((event) => (
                <option key={event} value={event}>
                  {t(`music.${event}`)}
                </option>
              ))}
            </select>
          </label>
          <CurrencyAmount currency="POINTS" amount={points} showTooltip={false} />
        </div>
        <div
          className="h-[min(34dvh,20rem)] overflow-y-auto border-y border-white/10"
          aria-busy={state.status === 'loading'}
        >
          {!state.snapshot && state.status === 'loading' && (
            <p className="p-4 text-neutral-300">{t('music.loading')}</p>
          )}
          {state.snapshot?.kits.map((kit) => {
            const owned = state.snapshot!.ownedIds.includes(kit.id)
            const equipped = Object.values(state.snapshot!.equipped).includes(kit.id)
            return (
              <div
                key={kit.id}
                className="flex min-h-24 flex-wrap items-center justify-between gap-3 border-b border-white/10 py-4"
              >
                <div className="flex size-16 shrink-0 items-center justify-center border border-white/10 bg-neutral-900">
                  {kit.logoUrl ? (
                    <img
                      src={kit.logoUrl}
                      alt=""
                      className="size-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Headphones className="size-7 text-neutral-300" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold">
                    {kit.id === 'quake' ? t('music.default') : kit.name}
                  </h3>
                  <div className="mt-1 text-sm text-neutral-300">
                    {kit.pricePoints === 0 ? (
                      t('music.free')
                    ) : (
                      <CurrencyAmount
                        currency="POINTS"
                        amount={kit.pricePoints}
                        showTooltip={false}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    className="w-28 gap-2"
                    onClick={() => void state.preview(kit.id)}
                  >
                    {state.playingId === kit.id ? (
                      <Square className="size-4" aria-hidden="true" />
                    ) : (
                      <Play className="size-4" aria-hidden="true" />
                    )}
                    {t(state.playingId === kit.id ? 'music.stop' : 'music.preview')}
                  </Button>
                  <Button
                    variant={equipped ? 'secondary' : 'primary'}
                    className="w-32 gap-2"
                    disabled={state.pending || state.status !== 'ready' || owned}
                    onClick={() => state.choosePurchase(kit)}
                  >
                    {state.pending ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : equipped ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : null}
                    {t(owned ? 'music.owned' : 'music.buy')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex min-h-28 flex-col justify-center gap-2 pt-3">
          <p role="status" className="min-h-5 text-sm text-rose-200">
            {state.error ? t(state.error) : ''}
          </p>
          {state.confirm ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 break-words text-sm">
                {t('music.confirm', { name: state.confirm.name, price: state.confirm.pricePoints })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  disabled={state.pending}
                  onClick={() => state.choosePurchase(null)}
                >
                  {t('music.cancel')}
                </Button>
                <Button
                  className="w-32"
                  disabled={state.pending || points < state.confirm.pricePoints}
                  onClick={() => void state.buy()}
                >
                  {t('music.buy')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                className="w-32"
                disabled={state.pending || state.status === 'loading'}
                onClick={() => void state.load()}
              >
                {t('music.retry')}
              </Button>
            </div>
          )}
        </div>
      </ModalDialog>
    </>
  )
}
