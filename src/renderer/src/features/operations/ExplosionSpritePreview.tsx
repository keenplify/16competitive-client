import { useEffect, useRef, useState, type JSX } from 'react'
import { decodeExplosionSprite, type SpriteFrame } from './explosion-sprite'

export function ExplosionSpritePreview({ skinId }: { skinId: string }): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [frames, setFrames] = useState<SpriteFrame[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.skins
      .previewExplosionSprite(skinId)
      .then((buffer) => {
        if (!cancelled) setFrames(buffer ? decodeExplosionSprite(buffer) : null)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn('Could not show explosion sprite preview', { skinId, error })
          setFrames(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [skinId])

  useEffect(() => {
    if (!frames?.length) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let index = reducedMotion ? Math.floor(frames.length / 2) : 0
    const draw = (): void => {
      const frame = frames[index]!
      canvas.width = frame.width
      canvas.height = frame.height
      const image = context.createImageData(frame.width, frame.height)
      image.data.set(frame.pixels)
      context.putImageData(image, 0, 0)
      if (!reducedMotion) index = (index + 1) % frames.length
    }
    draw()
    if (reducedMotion || frames.length === 1) return
    const interval = window.setInterval(draw, 90 / 1.75)
    return () => window.clearInterval(interval)
  }, [frames])

  if (!frames?.length) return null
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-label="Custom grenade explosion preview"
    >
      <canvas
        ref={canvasRef}
        className="absolute top-[41%] left-1/2 h-auto max-h-[72%] w-[78%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-80"
        style={{ imageRendering: 'pixelated' }}
        aria-hidden="true"
      />
      <span className="absolute right-7 bottom-12 z-10 border border-amber-200/40 bg-black/65 px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-amber-100 uppercase">
        Custom explosion
      </span>
    </div>
  )
}
