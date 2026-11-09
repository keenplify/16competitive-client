import { useLoadoutGameStore } from './loadout-game.store'
import { useState } from 'react'
import { X, LoaderCircle, Plus } from 'lucide-react'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { Button } from '../../components/ui/Button'
import { useEffectiveLauncherTheme } from '../settings/use-effective-launcher-theme'
import type { OwnedSticker } from '../../../../shared/stickers'
import { useCollectionsStore } from './collections.store'
import { twMerge } from 'tailwind-merge'
import { stockStickerModel } from '../../../../shared/stock-sticker-models'
import { useInventoryText } from '../inventory/inventory-i18n'
import { useInventoryStore } from '../inventory/inventory.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useTranslation } from '../i18n/i18n'
import translations from './skin-preview-translations.json'

export function AttachedStickerLinks({
  targetKey,
  targetName,
  onClose,
  className
}: {
  targetKey: string
  targetName?: string
  onClose: () => void
  className?: string
}) {
  const [removing, setRemoving] = useState<OwnedSticker | null>(null)
  const pending = useInventoryStore((s) => s.pending)
  const theme = useEffectiveLauncherTheme()
  const inventoryText = useInventoryText()
  const closeRemoval = () => {
    if (!useInventoryStore.getState().pending) setRemoving(null)
  }
  const game = useLoadoutGameStore((s) => s.game)
  const snapshot = useInventoryStore((s) => s.snapshot)
  const images = useInventoryStore((s) => s.images)
  const { language } = useTranslation()
  const text = translations[language]
  const stickers = (snapshot?.items ?? [])
    .filter(
      (item) =>
        item.gameVersion === game &&
        item.weaponKey === targetKey &&
        item.appliedAt &&
        item.projection
    )
    .sort((a, b) => a.appliedAt!.localeCompare(b.appliedAt!) || a.id.localeCompare(b.id))

  // Reserve the footer while inventory and artwork arrive, avoiding modal movement.
  return (
    <>
      <footer
        className={twMerge(
          'flex h-20 items-center gap-2 overflow-x-auto border-t border-white/10 px-4',
          className
        )}
        aria-label={text.attachedStickers}
      >
        {stickers.map((item) => {
          const label = text.viewStickerInStore.replace('{{name}}', item.name)
          return (
            <div key={item.id} className="relative shrink-0">
              <button
                type="button"
                title={label}
                aria-label={label}
                onClick={() => {
                  useCollectionsStore.getState().close()
                  onClose()
                  useNavigationStore.getState().openStickerStore(item.name)
                }}
                className="flex size-14 shrink-0 items-center justify-center border border-white/15 bg-black/10 p-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                {images[item.imagePath] ? (
                  <img
                    className="h-full w-full object-contain"
                    src={images[item.imagePath]}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <span className="line-clamp-2 text-xs">{item.name}</span>
                )}
              </button>
              <button
                type="button"
                disabled={pending}
                aria-label={text.removeStickerLabel.replace('{{name}}', item.name)}
                title={text.removeStickerLabel.replace('{{name}}', item.name)}
                onClick={() => setRemoving(item)}
                className={twMerge(
                  'absolute right-0 top-0 flex size-6 items-center justify-center border border-white/25 bg-neutral-900 text-neutral-200 hover:bg-red-950 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-50',
                  theme === 'vgui2' && 'vgui-window-close'
                )}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          )
        })}
        {(targetKey.startsWith('skin:') || stockStickerModel(targetKey.slice(6))) && (
          <Button
            type="button"
            variant="secondary"
            className="size-14 shrink-0 p-0"
            disabled={pending || stickers.length >= 5}
            aria-label={text.addSticker}
            title={stickers.length >= 5 ? inventoryText('limit') : text.addSticker}
            onClick={() => {
              const inventory = useInventoryStore.getState()
              if (inventory.pending) return
              inventory.close()
              useCollectionsStore.getState().close()
              onClose()
              inventory.selectWeapon({
                key: targetKey,
                name: targetName ?? targetKey,
                ...(targetKey.startsWith('skin:') ? { skinId: targetKey.slice(5) } : {})
              })
            }}
          >
            <Plus className="size-6" aria-hidden="true" />
          </Button>
        )}
      </footer>
      <ModalDialog
        open={!!removing}
        onClose={closeRemoval}
        role="alertdialog"
        label={text.removeStickerTitle}
        describedBy="sticker-removal-warning"
        className="max-w-md"
        contentClassName="p-6"
      >
        <h2 className="mb-4 text-lg font-semibold">{text.removeStickerTitle}</h2>
        <div className="mb-6 flex items-center gap-4">
          {removing && images[removing.imagePath] && (
            <img
              src={images[removing.imagePath]}
              alt=""
              className="size-16 shrink-0 object-contain"
            />
          )}
          <p id="sticker-removal-warning" className="text-sm leading-relaxed">
            {text.removeStickerWarning.replace('{{name}}', removing?.name ?? '')}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button autoFocus variant="secondary" disabled={pending} onClick={closeRemoval}>
            {text.cancel}
          </Button>
          <Button
            disabled={pending}
            className="gap-2"
            onClick={async () => {
              if (removing && (await useInventoryStore.getState().remove(removing.id)))
                setRemoving(null)
            }}
          >
            <span className="size-4">
              {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            </span>
            {text.removeSticker}
          </Button>
        </div>
      </ModalDialog>
    </>
  )
}
