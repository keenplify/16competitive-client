import { useCollectionsStore } from './collections.store'
import { twMerge } from 'tailwind-merge'
import { useInventoryStore } from '../inventory/inventory.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useTranslation } from '../i18n/i18n'
import translations from './skin-preview-translations.json'

export function AttachedStickerLinks({
  targetKey,
  onClose,
  className
}: {
  targetKey: string
  onClose: () => void
  className?: string
}) {
  const snapshot = useInventoryStore((s) => s.snapshot)
  const images = useInventoryStore((s) => s.images)
  const { language } = useTranslation()
  const text = translations[language]
  const stickers = (snapshot?.items ?? [])
    .filter((item) => item.weaponKey === targetKey && item.appliedAt && item.projection)
    .sort((a, b) => a.appliedAt!.localeCompare(b.appliedAt!) || a.id.localeCompare(b.id))

  // Reserve the footer while inventory and artwork arrive, avoiding modal movement.
  return (
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
          <button
            key={item.id}
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
        )
      })}
    </footer>
  )
}
