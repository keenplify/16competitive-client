import { useEffect, useRef } from 'react'
import { LoaderCircle, Move, RotateCw, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { StickerViewport } from './StickerViewport'
import { useStickerEditor } from './sticker-editor.store'
import { useInventoryText } from '../inventory/inventory-i18n'
import './sticker-placement.css'

export function StickerPlacementSurface({
  name,
  weaponKey,
  stockModel = true,
  presentationRotation,
  hiddenTextures,
  count,
  onApply,
  onClose,
  className,
  children
}: {
  name: string
  weaponKey?: string
  stockModel?: boolean
  presentationRotation?: readonly [number, number, number]
  hiddenTextures?: readonly string[]
  count: number
  onApply: () => void
  onClose?: () => void
  className?: string
  children?: React.ReactNode
}) {
  const t = useInventoryText()
  const { sticker, placement, setPlacement, placed, busy, model } = useStickerEditor()
  const decal = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!decal.current || !sticker) return
    decal.current.width = sticker.width
    decal.current.height = sticker.height
    decal.current
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(sticker.rgba), sticker.width, sticker.height),
        0,
        0
      )
  }, [sticker])
  return (
    <section className={twMerge('sticker-placement', className)} aria-label={t('apply')}>
      <header className="sticker-placement-heading">
        <h1>
          {t('apply')} <span>{count + 1}/5</span>
        </h1>
        <p>{name}</p>
        <small>{t('once')}</small>
      </header>
      {onClose && (
        <button
          className="sticker-placement-close"
          aria-label={t('close')}
          disabled={busy}
          onClick={onClose}
        >
          <X size={24} />
        </button>
      )}
      <div className="sticker-placement-model">
        <StickerViewport
          label={name}
          weaponKey={weaponKey}
          stockModel={stockModel}
          presentationRotation={presentationRotation}
          hiddenTextures={hiddenTextures}
        />
        {!model && <LoaderCircle className="animate-spin" aria-label={t('pending')} />}
      </div>
      <footer className="sticker-placement-footer">
        <p>{t('hint')}</p>
        <div className="sticker-placement-tools">
          <canvas
            ref={decal}
            aria-label={t('stickers')}
            draggable
            onDragStart={(event) => event.dataTransfer.setData('text/plain', '16c-sticker')}
          />
          <label>
            <Move size={16} aria-hidden />
            {t('size')}
            <input
              type="range"
              min="0.02"
              max="0.65"
              step="0.01"
              value={placement.size}
              disabled={busy}
              onChange={(e) => setPlacement({ size: Number(e.target.value) })}
            />
          </label>
          <label>
            <RotateCw size={16} aria-hidden />
            {t('rotation')}
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={placement.angle}
              disabled={busy}
              onChange={(e) => setPlacement({ angle: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="sticker-placement-actions">
          {onClose && (
            <button type="button" disabled={busy} onClick={onClose}>
              {t('cancel')}
            </button>
          )}
          <button
            className="sticker-placement-apply"
            disabled={!placed || busy || count >= 5}
            onClick={onApply}
          >
            {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : null}
            {t('apply')}
          </button>
          {children}
        </div>
      </footer>
    </section>
  )
}
