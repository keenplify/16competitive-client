import { ExternalLink, LoaderCircle, LockKeyhole, ShoppingCart, Ticket, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import { Button } from '../../components/ui/Button'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { PurchaseConfirmModal } from './PurchaseConfirmModal'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useAuthStore } from '../auth/auth.store'
import type { OwnedSkin, Skin, SkinCurrency } from '../../../../shared/skins'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { useNavigationStore } from '../navigation/navigation.store'
import { RedeemCodeModal } from '../redeem-codes/RedeemCodeModal'
import { getCachedSkinModel } from './skin-model-cache'
import {
  getSkinCameraDistanceMultiplier,
  getSkinCameraTarget,
  getSkinPresentationRotation
} from './skin-model-presentation'
import { SkinModelThumbnail } from './SkinModelThumbnail'
import { WEAPON_CATEGORIES, weaponCategory, type WeaponCategory } from './weapon-categories'
import {
  skinRarity,
  skinRarityOrder,
  skinRarityPresentation,
  skinRarityPresentationFor,
  type SkinRarity
} from './skin-rarity'
import elitePistolsImage from '../../assets/elite-pistols.png'

type SkinTypeFilter = 'all' | SkinRarity

const priceRange = (values: number[]): string | null => {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? min.toLocaleString() : `${min.toLocaleString()}–${max.toLocaleString()}`
}

function StoreFilterButton({
  label,
  count,
  active,
  onClick,
  tooltip,
  badgeClassName
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  tooltip?: string
  badgeClassName?: string
}): JSX.Element {
  return (
    <div className="group/filter relative">
      <button
        type="button"
        className={[
          'flex h-10 w-full items-center justify-between gap-3  border px-3 text-left text-xs font-semibold transition',
          active
            ? 'border-amber-200/70 bg-amber-300 text-neutral-950 shadow-[0_0_20px_rgba(252,211,77,.12)]'
            : 'border-transparent bg-white/[0.035] text-neutral-300 hover:border-white/10 hover:bg-white/[0.07] hover:text-white'
        ].join(' ')}
        onClick={onClick}
        title={tooltip}
      >
        <span className="truncate">{label}</span>
        <span
          className={[
            'min-w-6   px-1.5 py-0.5 text-center text-[10px] tabular-nums',
            active ? 'bg-black/15 text-neutral-900' : 'bg-black/25 text-neutral-500',
            badgeClassName ?? ''
          ].join(' ')}
        >
          {count}
        </span>
      </button>

      {tooltip && (
        <div className="pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-50 hidden w-64 -translate-y-1/2  border border-white/15 bg-neutral-950/95 p-3 text-left opacity-0 shadow-2xl backdrop-blur transition group-hover/filter:opacity-100 md:block">
          <p className="text-[10px] font-black tracking-[0.16em] text-neutral-500 uppercase">
            Typical price
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-200">{tooltip}</p>
        </div>
      )}
    </div>
  )
}

const ipcErrorPrefix = /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/

const errorDetails = (reason: unknown): { message: string; code?: string } => {
  if (!(reason instanceof Error)) return { message: 'Could not complete this shop request.' }
  const message = reason.message.replace(ipcErrorPrefix, '').trim()
  return {
    message: message || 'Could not complete this shop request.',
    code: (reason as Error & { code?: string }).code
  }
}

const safeExternalUrl = (value: string | null): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export function ShopPage(): JSX.Element {
  const points = useAuthStore((state) => state.session?.player.points ?? 0)
  const setPoints = useAuthStore((state) => state.setPoints)
  const [selectedCategory, setSelectedCategory] = useState<WeaponCategory>('all')
  const [selectedSkinType, setSelectedSkinType] = useState<SkinTypeFilter>('all')
  const [skins, setSkins] = useState<Skin[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [ownedSkins, setOwnedSkins] = useState<Map<string, OwnedSkin>>(new Map())
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [purchaseSkin, setPurchaseSkin] = useState<Skin | null>(null)
  const [previewSkin, setPreviewSkin] = useState<Skin | null>(null)
  const [showRedeemCode, setShowRedeemCode] = useState(false)
  const navigate = useNavigationStore((state) => state.navigate)
  const setProfileTab = useNavigationStore((state) => state.setProfileTab)
  const pCash = skins[0]?.viewerPCash ?? 0

  const load = useCallback((): void => {
    setStatus('loading')
    setError(null)
    void Promise.all([window.api.skins.list(), window.api.skins.mine()])
      .then(([catalog, inventory]) => {
        setSkins(catalog)
        setOwnedSkins(new Map(inventory.map((item) => [item.skin.id, item])))
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        setError(errorDetails(reason).message)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const weaponCounts = useMemo(() => {
    const counts = new Map<WeaponCategory, number>()
    counts.set('all', skins.length)
    for (const skin of skins) {
      const category = weaponCategory(skin.weaponKey)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return counts
  }, [skins])

  const rarityStats = useMemo(() => {
    const stats = new Map<SkinRarity, { count: number; points: number[]; pCash: number[] }>()
    for (const rarity of skinRarityOrder) {
      stats.set(rarity, { count: 0, points: [], pCash: [] })
    }
    for (const skin of skins) {
      const rarity = skinRarity(skin)
      const entry = stats.get(rarity)!
      entry.count += 1
      if (skin.pointsEnabled) entry.points.push(skin.pricePoints)
      if (skin.pricePCash !== null) entry.pCash.push(skin.pricePCash)
    }
    return stats
  }, [skins])

  const visibleRarities = useMemo(
    () => skinRarityOrder.filter((rarity) => (rarityStats.get(rarity)?.count ?? 0) > 0),
    [rarityStats]
  )

  const rarityTooltip = (rarity: SkinRarity): string => {
    const stats = rarityStats.get(rarity)
    if (!stats || stats.count === 0) return 'No skins of this type are currently listed.'

    const parts: string[] = []
    const points = priceRange(stats.points)
    const pCashRange = priceRange(stats.pCash)
    if (points) parts.push(`around ${points} Points`)
    if (pCashRange) parts.push(`around ${pCashRange} Papa Cash`)
    return parts.length > 0
      ? `Current catalog: ${parts.join(' or ')}.`
      : 'No purchasable skins of this type are currently listed.'
  }

  const filteredSkins = useMemo(
    () =>
      skins.filter(
        (skin) =>
          (selectedCategory === 'all' || weaponCategory(skin.weaponKey) === selectedCategory) &&
          (selectedSkinType === 'all' || skinRarity(skin) === selectedSkinType)
      ),
    [selectedCategory, selectedSkinType, skins]
  )

  const clearFilters = (): void => {
    setSelectedCategory('all')
    setSelectedSkinType('all')
  }

  const unlock = (skin: Skin, currency: SkinCurrency): void => {
    setBuyingId(skin.id)
    setPurchaseSkin(skin)
    setError(null)
    void window.api.skins
      .unlock(skin.id, currency)
      .then((result) => {
        if (result.currency === 'POINTS' && typeof result.points === 'number') {
          setPoints(result.points)
        }
        return Promise.all([window.api.skins.mine(), window.api.skins.list()])
      })
      .then(([inventory, catalog]) => {
        setOwnedSkins(new Map(inventory.map((item) => [item.skin.id, item])))
        setSkins(catalog)
      })
      .catch((reason: unknown) => {
        const failure = errorDetails(reason)
        if (failure.code === 'SKIN_ALREADY_OWNED') {
          void window.api.skins
            .mine()
            .then((inventory) =>
              setOwnedSkins(new Map(inventory.map((item) => [item.skin.id, item])))
            )
        }
        if (failure.code === 'SKIN_UNAVAILABLE') load()
        const message =
          failure.code === 'INSUFFICIENT_POINTS'
            ? 'You need more points to unlock this skin.'
            : failure.code === 'INSUFFICIENT_P_CASH'
              ? 'You need more Papa Cash to unlock this skin.'
              : failure.message
        toast.error(message)
      })
      .finally(() => {
        setBuyingId(null)
        setPurchaseSkin(null)
      })
  }

  const openLoadout = (): void => {
    setProfileTab('skins')
    navigate('profile')
  }

  const refreshOwnedSkins = useCallback(async (): Promise<void> => {
    const [inventory, catalog] = await Promise.all([
      window.api.skins.mine(),
      window.api.skins.list()
    ])
    setOwnedSkins(new Map(inventory.map((item) => [item.skin.id, item])))
    setSkins(catalog)
  }, [])

  return (
    <main className="min-h-[calc(100vh-5rem)] w-full p-4 text-white sm:p-6 xl:p-8">
      <div className="w-full">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-6 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Store</p>
            <h1 className="mt-2 text-3xl font-semibold">Skins on sale</h1>
            <p className="mt-2 text-sm text-neutral-200">
              Earn Points by playing. Papa Cash is the premium currency.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowRedeemCode(true)} className="text-white">
              <Ticket className="mr-2 size-4" aria-hidden="true" />
              Redeem Code
            </Button>
            <div className=" border border-sky-300/20 bg-sky-300/10 px-4 py-3">
              <CurrencyAmount
                currency="POINTS"
                amount={points}
                className="text-xl font-bold text-white"
                iconClassName="size-8"
              />
            </div>
            <div className=" border border-amber-300/20 bg-amber-300/10 px-4 py-3">
              <CurrencyAmount
                currency="P_CASH"
                amount={pCash}
                className="text-xl font-bold text-white"
                iconClassName="size-8"
              />
            </div>
          </div>
        </header>

        {error && (
          <p className="mt-5  border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        <div className="mt-6 grid items-start gap-5 md:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className=" border border-white/10 bg-neutral-950/75 p-3 shadow-xl md:sticky md:top-5 md:z-20">
            <div className="flex items-center justify-between gap-3 px-1 pb-2">
              <div>
                <p className="text-[10px] font-black tracking-[0.18em] text-neutral-500 uppercase">
                  Filters
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white">Weapons</p>
              </div>
              {(selectedCategory !== 'all' || selectedSkinType !== 'all') && (
                <button
                  type="button"
                  className="text-[10px] font-bold tracking-wide text-sky-300 uppercase transition hover:text-sky-200"
                  onClick={clearFilters}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="space-y-1" aria-label="Filter skins by weapon">
              {WEAPON_CATEGORIES.map((category) => (
                <StoreFilterButton
                  key={category.id}
                  label={category.label}
                  count={weaponCounts.get(category.id) ?? 0}
                  active={category.id === selectedCategory}
                  onClick={() => setSelectedCategory(category.id)}
                />
              ))}
            </div>

            <div className="my-4 h-px bg-white/10" />

            <div className="px-1 pb-2">
              <p className="text-[10px] font-black tracking-[0.18em] text-neutral-500 uppercase">
                Skin type
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Hover a type to see its usual price.
              </p>
            </div>

            <div className="space-y-1" aria-label="Filter skins by type">
              <StoreFilterButton
                label="All types"
                count={skins.length}
                active={selectedSkinType === 'all'}
                onClick={() => setSelectedSkinType('all')}
              />
              {visibleRarities.map((rarity) => {
                const presentation = skinRarityPresentationFor(rarity)
                const stats = rarityStats.get(rarity)
                return (
                  <StoreFilterButton
                    key={rarity}
                    label={presentation.label}
                    count={stats?.count ?? 0}
                    active={selectedSkinType === rarity}
                    onClick={() => setSelectedSkinType(rarity)}
                    tooltip={rarityTooltip(rarity)}
                    badgeClassName={presentation.className}
                  />
                )
              })}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-neutral-400">
                <span className="font-semibold text-white">{filteredSkins.length}</span>{' '}
                {filteredSkins.length === 1 ? 'skin' : 'skins'}
                {(selectedCategory !== 'all' || selectedSkinType !== 'all') && (
                  <span> matching your filters</span>
                )}
              </p>
            </div>

            {status === 'loading' ? (
              <div className="flex min-h-72 items-center justify-center" role="status">
                <LoaderCircle className="size-7 animate-spin text-sky-300" />
              </div>
            ) : null}
            {status === 'error' ? (
              <Button className="mt-6" variant="ghost" onClick={load}>
                Retry catalog
              </Button>
            ) : null}
            {status === 'ready' && filteredSkins.length === 0 ? (
              <div className="mt-4  border border-dashed border-white/15 p-10 text-center text-neutral-400">
                No skins match these filters.
              </div>
            ) : null}
            {status === 'ready' && filteredSkins.length > 0 ? (
              <section className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5">
                {filteredSkins.map((skin) => {
                  const owned = ownedSkins.get(skin.id)
                  const buying = buyingId === skin.id
                  const premiumOnly = !skin.pointsEnabled && skin.pricePCash !== null
                  const rarity = skinRarityPresentation(skin)
                  return (
                    <article
                      key={skin.id}
                      className="flex min-h-72 flex-col  border border-white/10 bg-neutral-900/90 p-5"
                    >
                      <SkinCardPreview
                        skin={skin}
                        owned={Boolean(owned)}
                        onOpen={() => setPreviewSkin(skin)}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold tracking-[0.16em] text-sky-400 uppercase">
                          {skin.weaponKey}
                        </p>
                        <span
                          className={`  border px-2 py-1 text-[10px] font-bold tracking-wide uppercase ${rarity.className}`}
                        >
                          {rarity.label}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-semibold">{skin.name}</h2>
                      <p className="mt-3 flex-1 text-sm text-neutral-400">
                        {skin.description ?? 'Custom weapon skin.'}
                      </p>
                      <div className="mt-5 flex items-end justify-between gap-3">
                        <div className="flex flex-col gap-1 font-semibold tabular-nums">
                          {owned ? (
                            <span className="text-emerald-300">Owned</span>
                          ) : (
                            <>
                              {skin.pointsEnabled && (
                                <CurrencyAmount
                                  currency="POINTS"
                                  amount={skin.pricePoints}
                                  className="font-semibold text-white"
                                  iconClassName="size-5"
                                />
                              )}
                              {skin.pricePCash !== null && (
                                <CurrencyAmount
                                  currency="P_CASH"
                                  amount={skin.pricePCash}
                                  className="font-semibold text-white"
                                  iconClassName="size-5"
                                />
                              )}
                            </>
                          )}
                        </div>
                        {owned ? (
                          <Button
                            className="h-9 px-3 text-xs"
                            variant="ghost"
                            onClick={openLoadout}
                          >
                            Manage loadout
                          </Button>
                        ) : (
                          <Button
                            className="size-10 px-0"
                            variant={premiumOnly ? 'primary' : 'secondary'}
                            disabled={buying}
                            aria-label={`Purchase ${skin.name}`}
                            title={`Purchase ${skin.name}`}
                            onClick={() => setPurchaseSkin(skin)}
                          >
                            {buying ? (
                              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <ShoppingCart className="size-4" aria-hidden="true" />
                            )}
                          </Button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </section>
            ) : null}
          </div>
        </div>
      </div>
      {purchaseSkin && (
        <PurchaseConfirmModal
          skin={purchaseSkin}
          pointsBalance={points}
          pCashBalance={pCash}
          busy={buyingId === purchaseSkin.id}
          onClose={() => {
            if (buyingId !== purchaseSkin.id) setPurchaseSkin(null)
          }}
          onConfirm={(currency) => unlock(purchaseSkin, currency)}
        />
      )}
      {previewSkin && (
        <ModalPortal>
          <SkinPreview
            key={previewSkin.id}
            skin={previewSkin}
            onClose={() => setPreviewSkin(null)}
          />
        </ModalPortal>
      )}
      {showRedeemCode && (
        <ModalPortal>
          <RedeemCodeModal
            onClose={() => setShowRedeemCode(false)}
            onRedeemed={refreshOwnedSkins}
          />
        </ModalPortal>
      )}
    </main>
  )
}

export function SkinCardPreview({
  skin,
  owned,
  onOpen
}: {
  skin: Skin
  owned: boolean
  onOpen: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="group relative mb-4 h-40 w-full overflow-hidden  border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(14,116,144,0.28),_transparent_68%)] text-left transition hover:border-sky-400/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      aria-label={`Open ${skin.name} 3D preview`}
      onClick={onOpen}
    >
      <SkinModelThumbnail
        cacheKey={`skin-card:v3:${skin.id}`}
        skinId={skin.id}
        modelKey={skin.id}
        weaponKey={skin.weaponKey}
        fallback={<span className="text-xs text-neutral-500">Preview unavailable</span>}
        className="pointer-events-none absolute inset-0"
      />
      {!owned && (
        <span className="absolute top-3 right-3 flex items-center gap-1   bg-black/65 px-2 py-1 text-[10px] font-bold tracking-wide text-neutral-200 uppercase backdrop-blur">
          <LockKeyhole className="size-3" /> Locked
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-3 pt-8 pb-3 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
        Open 3D preview
      </span>
    </button>
  )
}

export function SkinPreview({ skin, onClose }: { skin: Skin; onClose: () => void }): JSX.Element {
  const [model, setModel] = useState<ArrayBuffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sourceUrl = safeExternalUrl(skin.sourceUrl)
  const creatorUrl = safeExternalUrl(skin.creatorUrl)

  useEffect(() => {
    if (skin.weaponKey === 'elite') return
    let active = true
    void getCachedSkinModel(skin.id).then(
      (bytes) => {
        if (active) setModel(bytes)
      },
      (reason: unknown) => {
        if (active) setError(errorDetails(reason).message)
      }
    )
    return () => {
      active = false
    }
  }, [skin.id, skin.weaponKey])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${skin.name} preview`}
    >
      <section className="relative w-full max-w-3xl overflow-hidden  border border-white/15 bg-neutral-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="mt-1 text-lg font-semibold text-white">{skin.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
              {sourceUrl && (
                <a
                  className="inline-flex items-center gap-1 transition hover:text-sky-300 focus-visible:text-sky-300 focus-visible:outline-none"
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3" aria-hidden="true" />
                  Source
                </a>
              )}
              {creatorUrl ? (
                <a
                  className="inline-flex items-center gap-1 transition hover:text-sky-300 focus-visible:text-sky-300 focus-visible:outline-none"
                  href={creatorUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3" aria-hidden="true" />
                  {skin.creatorName}
                </a>
              ) : (
                <span>By {skin.creatorName}</span>
              )}
            </div>
          </div>
          <Button
            className="size-9 px-0"
            variant="ghost"
            aria-label="Close preview"
            data-audio-sfx="backward"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="relative h-96 bg-[radial-gradient(circle_at_center,_rgba(14,116,144,0.25),_transparent_65%)]">
          {skin.weaponKey === 'elite' ? (
            <img
              className="h-full w-full object-contain p-6"
              src={elitePistolsImage}
              alt={`${skin.name} Elite pistols`}
              draggable={false}
            />
          ) : model ? (
            <ModelViewer
              modelBuffer={model}
              modelKey={skin.id}
              presentationRotation={getSkinPresentationRotation(skin.weaponKey)}
              camera={{
                distanceMultiplier: getSkinCameraDistanceMultiplier(skin.weaponKey, 0.9),
                target: getSkinCameraTarget(skin.weaponKey)
              }}
              animation="idle1"
              maxFrameRate={30}
              disableZoom
              lockCameraDistance
              orbitAngleLimit={0.7}
              rotateSpeed={0.45}
              className="absolute inset-0"
            />
          ) : null}
          {skin.weaponKey !== 'elite' && !model && !error && (
            <div className="flex h-full items-center justify-center" role="status">
              <LoaderCircle className="size-7 animate-spin text-sky-300" />
            </div>
          )}
          {skin.weaponKey !== 'elite' && error && (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-rose-300">
              {error}
            </div>
          )}
          {skin.weaponKey !== 'elite' && model && (
            <span className="pointer-events-none absolute bottom-3 left-4   bg-black/45 px-2 py-1 text-xs text-neutral-300 backdrop-blur-sm">
              Drag to rotate
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
