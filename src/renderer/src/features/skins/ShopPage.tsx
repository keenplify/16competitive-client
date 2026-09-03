import { LoaderCircle, LockKeyhole, ShoppingBag, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import type { OwnedSkin, Skin } from '../../../../shared/skins'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { useNavigationStore } from '../navigation/navigation.store'

type WeaponCategory = 'all' | 'pistols' | 'smgs' | 'rifles' | 'snipers' | 'heavy' | 'knives'

const weaponCategory = (key: string): WeaponCategory => {
  if (['glock18', 'usp', 'p228', 'deagle', 'elite', 'fiveseven'].includes(key)) return 'pistols'
  if (['tmp', 'mac10', 'mp5navy', 'ump45', 'p90'].includes(key)) return 'smgs'
  if (['galil', 'famas', 'ak47', 'm4a1', 'aug', 'sg552'].includes(key)) return 'rifles'
  if (['scout', 'awp', 'sg550', 'g3sg1'].includes(key)) return 'snipers'
  if (key === 'knife') return 'knives'
  return 'heavy'
}

const weaponCategories: Array<{ id: WeaponCategory; label: string }> = [
  { id: 'all', label: 'All weapons' },
  { id: 'pistols', label: 'Pistols' },
  { id: 'smgs', label: 'SMGs' },
  { id: 'rifles', label: 'Rifles' },
  { id: 'snipers', label: 'Snipers' },
  { id: 'heavy', label: 'Machine gun' },
  { id: 'knives', label: 'Knife' }
] as const

const errorDetails = (reason: unknown): { message: string; code?: string } => {
  if (!(reason instanceof Error)) return { message: 'Could not complete this shop request.' }
  return { message: reason.message, code: (reason as Error & { code?: string }).code }
}

export function ShopPage(): JSX.Element {
  const points = useAuthStore((state) => state.session?.player.points ?? 0)
  const setPoints = useAuthStore((state) => state.setPoints)
  const [selectedCategory, setSelectedCategory] = useState<WeaponCategory>('all')
  const [skins, setSkins] = useState<Skin[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [ownedSkins, setOwnedSkins] = useState<Map<string, OwnedSkin>>(new Map())
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [previewSkin, setPreviewSkin] = useState<Skin | null>(null)
  const navigate = useNavigationStore((state) => state.navigate)
  const setProfileTab = useNavigationStore((state) => state.setProfileTab)

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

  const catalogLabel = useMemo(
    () => weaponCategories.find((category) => category.id === selectedCategory)?.label ?? 'All weapons',
    [selectedCategory]
  )
  const filteredSkins = useMemo(
    () =>
      selectedCategory === 'all'
        ? skins
        : skins.filter((skin) => weaponCategory(skin.weaponKey) === selectedCategory),
    [selectedCategory, skins]
  )

  const unlock = (skin: Skin): void => {
    setBuyingId(skin.id)
    setError(null)
    void window.api.skins
      .unlock(skin.id)
      .then((result) => {
        setPoints(result.points)
        return window.api.skins.mine()
      })
      .then((inventory) => setOwnedSkins(new Map(inventory.map((item) => [item.skin.id, item]))))
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
        setError(
          failure.code === 'INSUFFICIENT_POINTS'
            ? 'You need more points to unlock this skin.'
            : failure.message
        )
      })
      .finally(() => setBuyingId(null))
  }

  const openLoadout = (): void => {
    setProfileTab('skins')
    navigate('profile')
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] w-full bg-neutral-950/75 p-6 text-white sm:p-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Store</p>
            <h1 className="mt-2 text-3xl font-semibold">Skins on sale</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Choose a weapon, then unlock a skin for a future match.
            </p>
          </div>
          <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-right">
            <p className="text-[10px] font-bold tracking-[0.16em] text-amber-200 uppercase">
              Available points
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-300">
              {points.toLocaleString()}
            </p>
          </div>
        </header>
        <div className="mt-6 flex flex-wrap gap-2" aria-label="Filter skins by weapon">
          {weaponCategories.map((category) => (
            <Button
              key={category.id}
              className="h-9 px-3 text-xs"
              variant={category.id === selectedCategory ? 'primary' : 'ghost'}
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.label}
            </Button>
          ))}
        </div>
        {error && (
          <p className="mt-5 rounded-md border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}
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
          <div className="mt-8 rounded-xl border border-dashed border-white/15 p-10 text-center text-neutral-400">
            No {catalogLabel.toLowerCase()} skins are currently on sale.
          </div>
        ) : null}
        {status === 'ready' && filteredSkins.length > 0 ? (
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSkins.map((skin) => {
              const owned = ownedSkins.get(skin.id)
              const buying = buyingId === skin.id
              return (
                <article
                  key={skin.id}
                  className="flex min-h-72 flex-col rounded-xl border border-white/10 bg-neutral-900/90 p-5"
                >
                  <SkinCardPreview
                    skin={skin}
                    owned={Boolean(owned)}
                    onOpen={() => setPreviewSkin(skin)}
                  />
                  <p className="text-xs font-bold tracking-[0.16em] text-sky-400 uppercase">
                    {skin.weaponKey}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">{skin.name}</h2>
                  <p className="mt-3 flex-1 text-sm text-neutral-400">
                    {skin.description ?? 'Custom weapon skin.'}
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="font-semibold tabular-nums text-amber-300">
                      {owned ? 'Owned' : `${skin.pricePoints.toLocaleString()} pts`}
                    </span>
                    <Button
                      className="h-9 px-3 text-xs"
                      variant={owned ? 'ghost' : 'primary'}
                      disabled={buying}
                      onClick={() => (owned ? openLoadout() : unlock(skin))}
                    >
                      {owned ? (
                        'Manage loadout'
                      ) : buying ? (
                        'Unlocking…'
                      ) : (
                        <>
                          <ShoppingBag className="mr-1 size-3.5" /> Unlock
                        </>
                      )}
                    </Button>
                  </div>
                </article>
              )
            })}
          </section>
        ) : null}
      </div>
      {previewSkin && (
        <SkinPreview key={previewSkin.id} skin={previewSkin} onClose={() => setPreviewSkin(null)} />
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
  const [model, setModel] = useState<ArrayBuffer | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.skins.previewModel(skin.id).then(
      (bytes) => {
        if (active) setModel(bytes)
      },
      () => {
        if (active) setError(true)
      }
    )
    return () => {
      active = false
    }
  }, [skin.id])

  return (
    <button
      type="button"
      className="group relative mb-4 h-40 w-full overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(14,116,144,0.28),_transparent_68%)] text-left transition hover:border-sky-400/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      aria-label={`Open ${skin.name} 3D preview`}
      onClick={onOpen}
    >
      {model && (
        <ModelViewer
          modelBuffer={model}
          modelKey={skin.id}
          presentationRotation={[90, 0, 190]}
          camera={{ distanceMultiplier: 0.5 }}
          animation="idle1"
          maxFrameRate={20}
          cameraLocked
          className="pointer-events-none absolute inset-0"
        />
      )}
      {!model && !error && (
        <span className="absolute inset-0 flex items-center justify-center" role="status">
          <LoaderCircle className="size-5 animate-spin text-sky-300" />
        </span>
      )}
      {error && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">
          Preview unavailable
        </span>
      )}
      {!owned && (
        <span className="absolute top-3 right-3 flex items-center gap-1 rounded bg-black/65 px-2 py-1 text-[10px] font-bold tracking-wide text-neutral-200 uppercase backdrop-blur">
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

  useEffect(() => {
    let active = true
    void window.api.skins.previewModel(skin.id).then(
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
  }, [skin.id])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${skin.name} preview`}
    >
      <section className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-white/15 bg-neutral-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="mt-1 text-lg font-semibold">{skin.name}</h2>
          </div>
          <Button
            className="size-9 px-0"
            variant="ghost"
            aria-label="Close preview"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="relative h-96 bg-[radial-gradient(circle_at_center,_rgba(14,116,144,0.25),_transparent_65%)]">
          {model && (
            <ModelViewer
              modelBuffer={model}
              modelKey={skin.id}
              presentationRotation={[90, 0, 190]}
              camera={{ distanceMultiplier: 0.9 }}
              animation="idle1"
              maxFrameRate={30}
              disableZoom
              lockCameraDistance
              orbitAngleLimit={0.7}
              rotateSpeed={0.45}
              className="absolute inset-0"
            />
          )}
          {!model && !error && (
            <div className="flex h-full items-center justify-center" role="status">
              <LoaderCircle className="size-7 animate-spin text-sky-300" />
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-rose-300">
              {error}
            </div>
          )}
          {model && (
            <span className="pointer-events-none absolute bottom-3 left-4 rounded bg-black/45 px-2 py-1 text-xs text-neutral-300 backdrop-blur-sm">
              Drag to rotate
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
