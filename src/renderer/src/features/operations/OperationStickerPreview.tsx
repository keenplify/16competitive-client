import { useEffect, useState } from 'react'
import { LoaderCircle, Sticker } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { OperationTier } from '../../../../shared/operations'
import { isOperationStickerTier } from '../../../../shared/operations'
import { ensureStickerArtwork, useInventoryStore } from '../inventory/inventory.store'
import { useInventoryText } from '../inventory/inventory-i18n'

export function OperationStickerPreview({ tier, className }: { tier: OperationTier; className?: string }) {
  const path = isOperationStickerTier(tier as unknown as Record<string, unknown>) ? tier.sticker?.imagePath : null
  const image = useInventoryStore(state => path ? state.images[path] : undefined)
  const [failedPath, setFailedPath] = useState<string | null>(null)
  const t = useInventoryText()
  useEffect(() => {
    if (!path || image) return
    let active = true
    void ensureStickerArtwork(path).catch(() => { if (active) setFailedPath(path) })
    return () => { active = false }
  }, [path, image])
  return (
    <div className={twMerge('relative flex h-full w-full items-center justify-center p-4', className)}>
      {image ? <img src={image} alt={tier.sticker?.name ?? t('stickers')} className="h-full w-full object-contain" draggable={false} />
        : !path || failedPath === path ? <Sticker className="size-12 text-neutral-400" aria-label={t('stickers')} />
          : <LoaderCircle className="size-6 animate-spin text-sky-300" aria-label={t('pending')} />}
      <span className="absolute bottom-2 right-2 bg-neutral-950 px-2 py-1 text-sm font-semibold text-white">×{tier.amount ?? 1}</span>
    </div>
  )
}
