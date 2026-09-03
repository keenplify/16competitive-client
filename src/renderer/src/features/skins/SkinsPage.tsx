import { LoaderCircle, Palette, Power, PowerOff } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import type { OwnedSkin } from '../../../../shared/skins'
import { SkinCardPreview, SkinPreview } from './ShopPage'

const errorText = (reason: unknown): string =>
  reason instanceof Error ? reason.message : 'Could not update your loadout.'

export function SkinsPage(): JSX.Element {
  const [skins, setSkins] = useState<OwnedSkin[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [changingId, setChangingId] = useState<string | null>(null)
  const [previewSkin, setPreviewSkin] = useState<OwnedSkin['skin'] | null>(null)

  const refresh = (): void => {
    setStatus('loading')
    setError(null)
    void window.api.skins
      .mine()
      .then((inventory) => {
        setSkins(inventory)
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        setError(errorText(reason))
        setStatus('error')
      })
  }

  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [])

  const setEquipped = (owned: OwnedSkin): void => {
    setChangingId(owned.skin.id)
    setError(null)
    const request = owned.equippedAt
      ? window.api.skins.unequip(owned.skin.id)
      : window.api.skins.equip(owned.skin.id)
    void request
      .then(() => window.api.skins.mine())
      .then((inventory) => {
        setSkins(inventory)
        setStatus('ready')
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setChangingId(null))
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-72 items-center justify-center" role="status">
        <LoaderCircle className="size-7 animate-spin text-sky-300" />
      </div>
    )
  }

  return (
    <>
      <section className="mt-6">
        {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
        {status === 'error' ? (
          <Button variant="ghost" onClick={refresh}>
            Retry inventory
          </Button>
        ) : skins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-10 text-center">
            <Palette className="mx-auto size-7 text-neutral-500" aria-hidden="true" />
            <p className="mt-3 font-medium">No skins unlocked yet.</p>
            <p className="mt-1 text-sm text-neutral-400">
              Visit the Store to unlock a skin for your loadout.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {skins.map((owned) => {
              const equipped = owned.equippedAt !== null
              const changing = changingId === owned.skin.id
              return (
                <article
                  key={owned.skin.id}
                  className="rounded-xl border border-white/10 bg-neutral-900/90 p-5"
                >
                  <SkinCardPreview
                    skin={owned.skin}
                    owned
                    onOpen={() => setPreviewSkin(owned.skin)}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold tracking-[0.16em] text-sky-400 uppercase">
                        {owned.skin.weaponKey}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">{owned.skin.name}</h2>
                    </div>
                    {equipped && (
                      <Button
                        className="h-8 shrink-0 px-3 text-xs"
                        variant="ghost"
                        disabled={changing}
                        onClick={() => setEquipped(owned)}
                      >
                        {changing ? (
                          'Updating…'
                        ) : (
                          <>
                            <PowerOff className="mr-1 size-3.5" /> Unequip
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  {!equipped && (
                    <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
                      <Button
                        className="h-9 px-3 text-xs"
                        variant="primary"
                        disabled={changing}
                        onClick={() => setEquipped(owned)}
                      >
                        {changing ? (
                          'Updating…'
                        ) : (
                          <>
                            <Power className="mr-1 size-3.5" /> Equip
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
      {previewSkin && (
        <SkinPreview key={previewSkin.id} skin={previewSkin} onClose={() => setPreviewSkin(null)} />
      )}
    </>
  )
}
