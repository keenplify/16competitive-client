import { stockStickerModel } from '../../../../shared/stock-sticker-models'
import {
  PISTOL_WEAPON_KEYS,
  SHOTGUN_WEAPON_KEYS,
  SMG_WEAPON_KEYS,
  RIFLE_WEAPON_KEYS,
  SNIPER_WEAPON_KEYS,
  MACHINE_GUN_WEAPON_KEYS,
  GRENADE_WEAPON_KEYS,
  KNIFE_WEAPON_KEY
} from '../skins/weapon-categories'
import { stockWeaponPreview } from '../skins/stock-weapon-preview'
import { isCharacterModel } from '../skins/skin-model-presentation'
import { StickerPurchaseDialog } from './StickerPurchaseDialog'
import { useNavigationStore } from '../navigation/navigation.store'
import { useEffect, useRef, type ReactNode } from 'react'
import { Package, Sticker, LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { CurrencyAmount } from '../../components/CurrencyIcon'
import { SkinModelThumbnail } from '../skins/SkinModelThumbnail'
import { useInventoryStore, type WeaponTarget } from './inventory.store'
import { useInventoryText } from './inventory-i18n'
import { StickerPlacementSurface } from '../sticker-editor/StickerPlacementSurface'
import { useItemContextMenu } from './use-item-context-menu'

export function InventoryTile({
  title,
  image,
  children,
  onClick,
  className,
  actionLabel,
  focused
}: {
  focused?: boolean
  actionLabel?: string
  title: string
  image?: string
  children?: ReactNode
  onClick: () => void
  className?: string
}) {
  const t = useInventoryText()
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focused) {
      button.current?.scrollIntoView({ block: 'center' })
      button.current?.focus({ preventScroll: true })
    }
  }, [focused])
  const menu = useItemContextMenu(actionLabel ?? t('apply'), onClick)
  return (
    <div
      className={twMerge(
        'min-w-0 border border-white/15 bg-neutral-900/70',
        focused && 'ring-2 ring-sky-300',
        className
      )}
    >
      <button
        ref={button}
        type="button"
        className="flex w-full flex-col items-center gap-3 p-4 text-center hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-sky-300"
        onClick={onClick}
        onContextMenu={menu.onContextMenu}
        onKeyDown={menu.onKeyDown}
      >
        <span className="flex h-28 w-full items-center justify-center">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-contain" />
          ) : (
            <Sticker className="size-10 text-neutral-500" aria-hidden />
          )}
        </span>
        <span className="w-full truncate text-sm font-semibold" title={title}>
          {title}
        </span>
      </button>
      {children}
      {menu.menu}
    </div>
  )
}
export function InventoryPage() {
  const state = useInventoryStore()
  const t = useInventoryText()
  useEffect(() => {
    void useInventoryStore.getState().load()
  }, [])
  const items = state.snapshot?.items.filter((i) => !i.appliedAt) ?? []
  const focus = useNavigationStore((s) => s.purchasedItem)
  useEffect(() => {
    if (focus?.kind === 'sticker') useInventoryStore.setState({ filter: 'all' })
  }, [focus])
  const showStickers = ['all', 'stickers'].includes(state.filter)
  return (
    <section className="min-h-[560px] py-6" aria-label={t('inventory')}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('inventory')}>
          {(['all', 'stickers', 'consumables'] as const).map((filter) => (
            <Button
              key={filter}
              variant={state.filter === filter ? 'primary' : 'ghost'}
              onClick={() => useInventoryStore.setState({ filter })}
            >
              {t(filter)}
            </Button>
          ))}
        </div>
        <Button variant="ghost" onClick={() => useNavigationStore.getState().navigate('store')}>
          {t('shop')}
        </Button>
      </div>
      {state.loading && !state.snapshot ? (
        <div className="grid min-h-96 place-items-center" role="status">
          <LoaderCircle className="size-6 animate-spin" aria-label={t('pending')} />
        </div>
      ) : state.error ? (
        <div className="grid min-h-96 content-center justify-items-center gap-4">
          <p role="alert">{t('error')}</p>
          <Button onClick={() => void useInventoryStore.getState().reload()}>{t('retry')}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {showStickers &&
            items.map((item) => (
              <InventoryTile
                key={item.id}
                focused={focus?.kind === 'sticker' && focus.id === item.id}
                title={item.name}
                image={state.images[item.imagePath]}
                onClick={() => state.selectSticker(item)}
              />
            ))}
          {(state.filter === 'consumables' ||
            (['all', 'stickers'].includes(state.filter) && !items.length)) && (
            <div className="col-span-full grid min-h-80 content-center justify-items-center gap-4 text-neutral-300">
              <Package className="size-9" aria-hidden />
              <p>{t('empty')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
export function WeaponTile({
  target,
  weaponKey = 'ak47',
  equipped,
  className
}: {
  target: WeaponTarget
  weaponKey?: string
  equipped?: boolean
  className?: string
}) {
  const t = useInventoryText()
  const open = () => {
    if (stockStickerModel(weaponKey)) useInventoryStore.getState().selectWeapon(target)
  }
  const menu = useItemContextMenu(t('customize'), open, !stockStickerModel(weaponKey))
  return (
    <div
      className={twMerge('relative min-w-0 border border-white/15 bg-neutral-900/70', className)}
    >
      <button
        type="button"
        disabled={!stockStickerModel(weaponKey)}
        onClick={open}
        onContextMenu={menu.onContextMenu}
        onKeyDown={menu.onKeyDown}
        className="flex w-full flex-col gap-3 p-4 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-sky-300"
      >
        <SkinModelThumbnail
          showAppliedStickers
          cacheKey={target.key}
          skinId={target.skinId}
          modelPath={
            !target.skinId ? stockWeaponPreview(weaponKey, target.name).viewModelPath! : undefined
          }
          weaponKey={weaponKey}
          className="h-28 w-full"
          fallback={weaponKey.toUpperCase()}
        />
        <span className="w-full truncate text-center text-sm font-semibold">{target.name}</span>
        <span className="min-h-8 text-center text-xs text-neutral-400">
          {!stockStickerModel(weaponKey) ? t('stickerUnsupported') : ''}
        </span>
      </button>
      {equipped && (
        <span className="absolute left-2 top-2 text-xs text-emerald-300">{t('equipped')}</span>
      )}
      {menu.menu}
    </div>
  )
}
const stickerPickerWeapons = [
  ...PISTOL_WEAPON_KEYS,
  ...SHOTGUN_WEAPON_KEYS,
  ...SMG_WEAPON_KEYS,
  ...RIFLE_WEAPON_KEYS,
  ...SNIPER_WEAPON_KEYS,
  ...MACHINE_GUN_WEAPON_KEYS,
  ...GRENADE_WEAPON_KEYS,
  KNIFE_WEAPON_KEY
]

export function InventoryDialogs() {
  const s = useInventoryStore()
  const t = useInventoryText()
  const unused = s.snapshot?.items.filter((i) => !i.appliedAt) ?? []
  return (
    <>
      <ModalDialog open={s.editing} onClose={s.close} fullScreen label={t('apply')}>
        <InventoryNotice />
        {s.editing && (
          <StickerPlacementSurface
            name={s.target?.name ?? ''}
            stockModel={!s.target?.skinId}
            presentationRotation={
              s.weapons.find((w) => w.skin.id === s.target?.skinId)?.skin.previewRotation
            }
            hiddenTextures={
              s.weapons.find((w) => w.skin.id === s.target?.skinId)?.skin.previewHiddenTextures
            }
            weaponKey={
              s.target?.skinId
                ? s.weapons.find((weapon) => weapon.skin.id === s.target?.skinId)?.skin.weaponKey
                : s.target?.key.slice(6)
            }
            count={s.snapshot?.items.filter((i) => i.weaponKey === s.target?.key).length ?? 0}
            onApply={() => void s.apply()}
            onClose={s.close}
          />
        )}
      </ModalDialog>
      <ModalDialog
        open={!s.editing && !!(s.target || s.selectedSticker)}
        onClose={s.close}
        label={t(s.target ? 'chooseSticker' : 'chooseWeapon')}
        contentClassName="p-6"
      >
        <InventoryNotice />
        <header className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">
            {t(s.target ? 'chooseSticker' : 'chooseWeapon')}
          </h2>
          <Button variant="ghost" disabled={s.pending} onClick={s.close}>
            {t('close')}
          </Button>
        </header>
        <div className="grid max-h-[65vh] min-h-48 grid-cols-2 gap-4 overflow-y-auto sm:grid-cols-3">
          {s.target && !s.loading && unused.length === 0 && (
            <p className="col-span-full flex min-h-48 items-center justify-center text-sm text-neutral-400">
              {t('empty')}
            </p>
          )}
          {s.target ? (
            unused.map((item) => (
              <InventoryTile
                key={item.id}
                title={item.name}
                image={s.images[item.imagePath]}
                onClick={() => {
                  if (!s.pending) s.selectSticker(item)
                }}
              />
            ))
          ) : (
            <>
              {s.weapons
                .filter((w) => !isCharacterModel(w.skin.weaponKey) && !w.reviewOnly)
                .map((w) => (
                  <WeaponTile
                    key={w.skin.id}
                    weaponKey={w.skin.weaponKey}
                    target={{ key: `skin:${w.skin.id}`, name: w.skin.name, skinId: w.skin.id }}
                  />
                ))}
              {stickerPickerWeapons.map((weaponKey) => (
                <WeaponTile
                  key={`stock:${weaponKey}`}
                  weaponKey={weaponKey}
                  target={{
                    key: `stock:${weaponKey}`,
                    name: t('stockWeapon').replace(
                      '{{weapon}}',
                      weaponKey === 'ak47' ? 'AK-47' : weaponKey.toUpperCase()
                    )
                  }}
                />
              ))}
            </>
          )}
          {s.target && !unused.length && (
            <p className="col-span-full self-center text-center text-neutral-300">{t('empty')}</p>
          )}
        </div>
      </ModalDialog>
      <StickerPurchaseDialog />
    </>
  )
}

function InventoryNotice() {
  const notice = useInventoryStore((state) => state.notice)
  const editing = useInventoryStore((state) => state.editing)
  const t = useInventoryText()
  if (!notice || (editing && notice.kind === 'success')) return null
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className="pointer-events-none fixed right-6 top-6 z-50 max-w-sm border border-white/20 bg-neutral-900 px-4 py-3 text-sm shadow-xl"
    >
      {t(notice.key)}
    </div>
  )
}

export function StickerStoreCard({
  item,
  image
}: {
  item: NonNullable<ReturnType<typeof useInventoryStore.getState>['snapshot']>['catalog'][number]
  image?: string
}) {
  const t = useInventoryText()
  return (
    <InventoryTile
      title={item.name}
      image={image}
      actionLabel={t(item.pricePoints === 0 || item.pricePCash === 0 ? 'claim' : 'buy')}
      onClick={() => useInventoryStore.getState().selectPurchase(item)}
    >
      <div className="flex min-h-10 justify-center gap-4 px-3 pb-4">
        {item.pricePoints === 0 || item.pricePCash === 0 ? (
          <span>{t('free')}</span>
        ) : (
          <>
            {item.pricePoints !== null && (
              <CurrencyAmount currency="POINTS" amount={item.pricePoints} showTooltip={false} />
            )}
            {item.pricePCash !== null && (
              <CurrencyAmount currency="P_CASH" amount={item.pricePCash} showTooltip={false} />
            )}
          </>
        )}
      </div>
    </InventoryTile>
  )
}
