import { useState } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { SkinCardPreview, SkinPreview } from './ShopPage'
import { useCollectionsStore } from './collections.store'
import { useCollectionText } from './collection-i18n'
import type { Skin, SkinCurrency } from '../../../../shared/skins'
import { twMerge } from 'tailwind-merge'

function CollectionItem({
  skin,
  blocked,
  onBuy,
  className
}: {
  skin: Skin & { owned: boolean }
  blocked: boolean
  onBuy: (skin: Skin, currency: SkinCurrency) => void
  className?: string
}) {
  const t = useCollectionText()
  const [preview, setPreview] = useState(false)
  return (
    <article
      className={twMerge(
        'flex min-h-80 flex-col border border-white/10 bg-neutral-900 p-5',
        className
      )}
    >
      <SkinCardPreview skin={skin} owned={skin.owned} onOpen={() => setPreview(true)} />
      {preview && <SkinPreview skin={skin} onClose={() => setPreview(false)} />}
      <h2 className="mt-3 text-xl font-semibold">{skin.name}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-neutral-300">{skin.description}</p>
      <div className="mt-5 flex min-h-24 flex-col justify-end gap-2">
        {skin.owned ? (
          <p className="text-sm text-emerald-300">{t('owned')}</p>
        ) : (
          <>
            {skin.pointsEnabled && (
              <Button variant="secondary" disabled={blocked} onClick={() => onBuy(skin, 'POINTS')}>
                <span>{t('buy')}</span>
                <CurrencyAmount currency="POINTS" amount={skin.pricePoints} />
              </Button>
            )}
            {skin.pricePCash !== null && (
              <Button variant="secondary" disabled={blocked} onClick={() => onBuy(skin, 'P_CASH')}>
                <span>{t('buy')}</span>
                <CurrencyAmount currency="P_CASH" amount={skin.pricePCash} />
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  )
}

export function CollectionPage() {
  const state = useCollectionsStore()
  const t = useCollectionText()
  const [item, setItem] = useState<{ skin: Skin; currency: SkinCurrency } | null>(null)
  const collection = state.detail?.collection
  const uncertain = state.request?.id === state.selectedId
  return (
    <section className="min-h-[calc(100vh-5rem)] overflow-y-auto bg-neutral-950/95 px-5 py-6 text-white md:px-10">
      <div className="mx-auto max-w-7xl">
        <Button
          variant="ghost"
          onClick={state.close}
          disabled={state.buying || Boolean(state.request)}
        >
          <ArrowLeft className="size-4" />
          {t('back')}
        </Button>
        {!collection ? (
          <div
            className="mt-6 grid min-h-96 place-content-center border border-white/10"
            role="status"
          >
            <p>{t(state.status === 'error' ? 'unavailable' : 'loading')}</p>
            {state.status === 'error' && (
              <Button onClick={() => void state.open(state.selectedId!)}>{t('retry')}</Button>
            )}
          </div>
        ) : (
          <>
            <div className="mt-5 aspect-[21/8] overflow-hidden bg-neutral-900">
              {collection.videoUrl ? (
                <video
                  key={collection.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={collection.imageUrl}
                  src={collection.videoUrl}
                  aria-label={collection.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={collection.imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="my-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
              <div>
                <h1 className="text-3xl font-semibold md:text-4xl">{collection.name}</h1>
                <p className="mt-4 max-w-prose whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                  {collection.description}
                </p>
              </div>
              <section
                aria-label={t('buyPackage')}
                className="border border-white/15 bg-neutral-900 p-5"
              >
                <h2 className="text-lg font-semibold">{t('buyPackage')}</h2>
                <p className="mt-2 text-sm text-amber-200">
                  {t('discount', { percent: String(collection.discountPercent) })}
                </p>
                <label className="mt-4 flex items-center justify-between gap-3 text-sm">
                  {t('currency')}
                  <select
                    value={state.currency}
                    disabled={state.buying || Boolean(state.request)}
                    onChange={(e) => void state.setCurrency(e.target.value as SkinCurrency)}
                    className="h-10 rounded-none border border-white/20 bg-neutral-950 px-3"
                  >
                    <option value="P_CASH">P Cash</option>
                    <option value="POINTS">Points</option>
                  </select>
                </label>
                <div
                  className="mt-4 flex h-9 items-center justify-between gap-3 tabular-nums"
                  aria-live="polite"
                >
                  <span>{t('total')}</span>
                  {state.quote ? (
                    <div className="flex items-center gap-3">
                      <del className="text-sm text-neutral-400">
                        {state.quote.subtotal.toLocaleString()}
                      </del>
                      <CurrencyAmount currency={state.quote.currency} amount={state.quote.total} />
                    </div>
                  ) : (
                    <span>
                      {state.quoteStatus === 'loading' ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        '—'
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-3 min-h-14 text-xs leading-5 text-neutral-300">{t('quoteHint')}</p>
                <Button
                  className="mt-3 h-11 w-full"
                  disabled={state.buying || (!state.quote && !uncertain)}
                  onClick={() => (uncertain ? void state.buy() : state.confirm(true))}
                >
                  {state.buying ? (
                    <LoaderCircle className="size-4 animate-spin" aria-label={t('pending')} />
                  ) : (
                    t(uncertain ? 'retry' : 'buyPackage')
                  )}
                </Button>
                <div className="mt-3 min-h-20 text-sm leading-6" role="status">
                  <p
                    className={
                      state.notice === 'success' || state.notice === 'owned'
                        ? 'text-emerald-300'
                        : 'text-amber-200'
                    }
                  >
                    {state.notice ? t(state.notice) : ''}
                  </p>
                  {!uncertain && state.quoteStatus === 'error' && state.notice !== 'owned' && (
                    <Button
                      variant="ghost"
                      className="mt-1"
                      onClick={() => void state.refreshQuote()}
                    >
                      {t('retry')}
                    </Button>
                  )}
                </div>
              </section>
            </div>
            <h2 className="mb-4 text-xl font-semibold">{t('individual')}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {state.detail!.items.map((skin) => (
                <CollectionItem
                  key={skin.id}
                  skin={skin}
                  blocked={state.buying || Boolean(state.request)}
                  onBuy={(skin, currency) => setItem({ skin, currency })}
                />
              ))}
            </div>
            {!state.detail!.items.length && <p className="py-12 text-neutral-300">{t('empty')}</p>}
          </>
        )}
        {(state.confirmation || item) && (
          <ModalDialog
            open
            onClose={() => {
              if (!state.buying) {
                state.confirm(false)
                setItem(null)
              }
            }}
            labelledBy="collection-confirm"
            className="w-[calc(100%-2rem)] max-w-md border border-white/15 bg-neutral-950 p-6 text-white"
          >
            <h2 id="collection-confirm" className="text-xl font-semibold">
              {t('confirm')}
            </h2>
            <p className="mt-3 text-neutral-300">{item?.skin.name ?? collection?.name}</p>
            <div className="mt-4 h-8">
              {item ? (
                <CurrencyAmount
                  currency={item.currency}
                  amount={
                    item.currency === 'POINTS' ? item.skin.pricePoints : item.skin.pricePCash!
                  }
                />
              ) : (
                state.quote && (
                  <CurrencyAmount currency={state.quote.currency} amount={state.quote.total} />
                )
              )}
            </div>
            <div className="mt-3 min-h-20 text-sm leading-6 text-amber-200" role="status">
              {state.notice ? t(state.notice) : ''}
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={state.buying}
                onClick={() => {
                  state.confirm(false)
                  setItem(null)
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                className="h-11 flex-1"
                disabled={state.buying}
                onClick={() => {
                  if (item)
                    void state.buyItem(item.skin.id, item.currency).finally(() => setItem(null))
                  else void state.buy()
                }}
              >
                {state.buying ? (
                  <LoaderCircle className="size-4 animate-spin" aria-label={t('pending')} />
                ) : (
                  t('confirm')
                )}
              </Button>
            </div>
          </ModalDialog>
        )}
      </div>
    </section>
  )
}
