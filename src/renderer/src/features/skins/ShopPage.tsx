import { ModalDialog } from '../../components/ui/ModalDialog'
import { ExternalLink, LoaderCircle, LockKeyhole, Search, ShoppingCart, Ticket, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { CurrencyAmount, CurrencyBalance } from '../../components/CurrencyIcon'
import { PurchaseConfirmModal } from './PurchaseConfirmModal'
import { useAuthStore } from '../auth/auth.store'
import type { OwnedSkin, Skin, SkinCurrency } from '../../../../shared/skins'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { useNavigationStore } from '../navigation/navigation.store'
import { RedeemCodeModal } from '../redeem-codes/RedeemCodeModal'
import { getCachedSkinModel } from './skin-model-cache'
import { skinPreviewRevision } from '../../../../shared/skins'
import {
  getSkinCameraDistanceMultiplier,
  getSkinCameraTarget,
  getSkinPresentationRotation
} from './skin-model-presentation'
import { SkinModelThumbnail } from './SkinModelThumbnail'
import { WEAPON_CATEGORIES, isGrenadeWeapon, weaponCategory, type WeaponCategory } from './weapon-categories'
import {
  skinRarity,
  skinRarityOrder,
  skinRarityPresentation,
  skinRarityPresentationFor,
  type SkinRarity
} from './skin-rarity'
import elitePistolsImage from '../../assets/elite-pistols.png'
import { PCashTopUpButton, PCashTopUpModal } from './PCashTopUp'
import { usePaymentsStore } from './payments.store'

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
          'flex h-7 w-full items-center justify-between gap-1 border px-2 text-left text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-300',
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
            'min-w-5 px-1 py-0.5 text-center text-[9px] tabular-nums',
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
  const [searchQuery, setSearchQuery] = useState('')
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
  const paymentBalance = usePaymentsStore((state) => state.snapshot?.pCash)
  const pCash = paymentBalance ?? skins[0]?.viewerPCash ?? 0

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
    () => {
      const query = searchQuery.trim().toLocaleLowerCase()
      return skins
        .filter(
          (skin) =>
            (selectedCategory === 'all' || weaponCategory(skin.weaponKey) === selectedCategory) &&
            (selectedSkinType === 'all' || skinRarity(skin) === selectedSkinType) &&
            (!query || `${skin.name} ${skin.weaponKey}`.toLocaleLowerCase().includes(query))
        )
        .sort((left, right) => Number(ownedSkins.has(left.id)) - Number(ownedSkins.has(right.id)))
    },
    [ownedSkins, searchQuery, selectedCategory, selectedSkinType, skins]
  )

  const clearFilters = (): void => {
    setSelectedCategory('all')
    setSelectedSkinType('all')
    setSearchQuery('')
  }

  const unlock = (skin: Skin, currency: SkinCurrency): void => {
    setBuyingId(skin.id)
    setPurchaseSkin(skin)
    setError(null)
    void window.api.skins
      .unlock(skin.id, currency)
      .then((result) => {
        if (typeof result.pCash === 'number') {
          usePaymentsStore.setState((state) => ({
            snapshot: state.snapshot ? { ...state.snapshot, pCash: result.pCash! } : null
          }))
        }
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
    void usePaymentsStore.getState().load()
  }, [])

  return (
    <main className="shop-page flex h-[calc(100dvh-4rem)] min-h-0 w-full flex-col overflow-hidden p-4 text-white sm:h-[calc(100dvh-5rem)] sm:p-6 xl:p-8">
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-6 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
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
            <CurrencyBalance currency="POINTS" amount={points} />
            <CurrencyBalance
              currency="P_CASH"
              amount={pCash}
              action={<PCashTopUpButton className="size-8" />}
            />
          </div>
        </header>

        <PCashTopUpModal />

        {error && (
          <p className="mt-5  border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        <div className="mt-5 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] items-start gap-5 md:grid-cols-[210px_minmax(0,1fr)] md:grid-rows-1 xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border border-white/10 bg-neutral-950/75 p-3 shadow-xl">
            <div className="flex items-center justify-between gap-3 px-1 pb-2">
              <div>
                <p className="text-[10px] font-black tracking-[0.18em] text-neutral-500 uppercase">
                  Filters
                </p>
              </div>
              {(selectedCategory !== 'all' || selectedSkinType !== 'all' || searchQuery.trim()) && (
                <button
                  type="button"
                  className="text-[10px] font-bold tracking-wide text-sky-300 uppercase transition hover:text-sky-200"
                  onClick={clearFilters}
                >
                  Clear
                </button>
              )}
            </div>

            <TextField
              label="Search skins"
              placeholder="Skin name or weapon"
              leadingIcon={<Search className="size-4" />}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              maxLength={120}
              autoComplete="off"
              className="h-9 pl-9"
            />

            <p className="px-1 pt-3 pb-1.5 text-xs font-semibold text-white">Weapons</p>

            <div className="grid grid-cols-3 gap-1 md:grid-cols-2" aria-label="Filter skins by weapon">
              {WEAPON_CATEGORIES.filter(
                (category) => category.id === 'all' || (weaponCounts.get(category.id) ?? 0) > 0
              ).map((category) => (
                <StoreFilterButton
                  key={category.id}
                  label={category.label}
                  count={weaponCounts.get(category.id) ?? 0}
                  active={category.id === selectedCategory}
                  onClick={() => setSelectedCategory(category.id)}
                />
              ))}
            </div>

            <div className="my-3 h-px bg-white/10" />

            <div className="px-1 pb-1.5">
              <p className="text-[10px] font-black tracking-[0.18em] text-neutral-500 uppercase">
                Skin type
              </p>
            </div>

            <div className="grid grid-cols-3 gap-1 md:grid-cols-2" aria-label="Filter skins by type">
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

          <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-4" tabIndex={0} aria-label="Skins on sale">
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-neutral-400">
                <span className="font-semibold text-white">{filteredSkins.length}</span>{' '}
                {filteredSkins.length === 1 ? 'skin' : 'skins'}
                {(selectedCategory !== 'all' || selectedSkinType !== 'all' || searchQuery.trim()) && (
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
                      className={`flex min-h-72 flex-col border border-white/10 bg-neutral-900/90 p-5 ${owned ? 'opacity-75' : ''}`}
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
        <>
          <SkinPreview
            key={previewSkin.id}
            skin={previewSkin}
            onClose={() => setPreviewSkin(null)}
          />
        </>
      )}
      {showRedeemCode && (
        <>
          <RedeemCodeModal
            onClose={() => setShowRedeemCode(false)}
            onRedeemed={refreshOwnedSkins}
          />
        </>
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
      className="weapon-preview-well group relative mb-4 h-40 w-full overflow-hidden  border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(14,116,144,0.28),_transparent_68%)] text-left transition hover:border-sky-400/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      aria-label={`Open ${skin.name} 3D preview`}
      onClick={onOpen}
    >
      <SkinModelThumbnail
        key={`${skin.id}:${skinPreviewRevision(skin)}`}
        cacheKey={`skin-card:v3:${skin.id}`}
        skinId={skin.id}
        sourceRevision={skinPreviewRevision(skin)}
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
  return (
    <SkinPreviewContent
      key={`${skin.id}:${skinPreviewRevision(skin)}`}
      skin={skin}
      onClose={onClose}
    />
  )
}

function SkinPreviewContent({ skin, onClose }: { skin: Skin; onClose: () => void }): JSX.Element {
  const [model, setModel] = useState<ArrayBuffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sourceUrl = safeExternalUrl(skin.sourceUrl)
  const creatorUrl = safeExternalUrl(skin.creatorUrl)

  useEffect(() => {
    if (skin.weaponKey === 'elite') return
    let active = true
    void getCachedSkinModel(skin.id, skinPreviewRevision(skin)).then(
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
  }, [skin.id, skin.weaponKey, skin.playerModelPath])

  return (
    <ModalDialog
      open
      onClose={onClose}
      vguiTitlebar={false}
      className="w-[calc(100%-2rem)] max-w-3xl overflow-hidden  border border-white/15 bg-neutral-950 shadow-2xl"
      label={`${skin.name} preview`}
    >
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
      <div className="skin-preview-stage relative h-96 bg-[radial-gradient(circle_at_center,_rgba(14,116,144,0.25),_transparent_65%)]">
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
            sourceRevision={skinPreviewRevision(skin)}
            presentationRotation={getSkinPresentationRotation(skin.weaponKey)}
            camera={{
              distanceMultiplier: getSkinCameraDistanceMultiplier(skin.weaponKey, 0.9),
              target: getSkinCameraTarget(skin.weaponKey)
            }}
            animation="idle1"
            freezeAnimation={isGrenadeWeapon(skin.weaponKey)}
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
    </ModalDialog>
  )
}
