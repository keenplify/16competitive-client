import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { Skin } from '../../../../shared/skins'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { decodeExplosionSprite, type SpriteFrame } from '../operations/explosion-sprite'
import { useAudioSettingsStore } from '../audio/audio.store'
import { getSkinPresentationRotation } from './skin-model-presentation'
import { getCachedSkinModel } from './skin-model-cache'
import {
  GRENADE_FLIGHT_MS,
  GRENADE_EXPLOSION_MS,
  type PreviewAction
} from './first-person-preview.store'

type Props = {
  skin: Skin
  action: PreviewAction
  burst: number
  label: string
  unavailableLabel: string
  className?: string
}
const projectileCamera = { distanceMultiplier: 1.2 } as const

/** A presentation of the actual grenade asset; no game simulation or account state. */
export function GrenadeThrowPreview({
  skin,
  action,
  burst,
  label,
  unavailableLabel,
  className
}: Props): JSX.Element {
  const [frames, setFrames] = useState<SpriteFrame[]>([])
  const [projectile, setProjectile] = useState<ArrayBuffer | null>(null)
  const [sound, setSound] = useState<AudioBuffer | null>(null)
  const [failed, setFailed] = useState(false)
  const rotation = useMemo(
    () => getSkinPresentationRotation(skin.weaponKey, skin.previewRotation),
    [skin.weaponKey, skin.previewRotation]
  )
  const projectileVisible = action === 'throw' || action === 'flight'
  const volume = useAudioSettingsStore((state) => state.sfxVolume)
  const root = useRef<HTMLDivElement>(null)
  const grenade = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const context = useRef<AudioContext | null>(null)
  const source = useRef<AudioBufferSourceNode | null>(null)
  const gain = useRef<GainNode | null>(null)
  const lastSound = useRef(0)
  useEffect(() => {
    let active = true
    const audio = window.AudioContext ? new AudioContext() : null
    context.current = audio
    if (audio) {
      gain.current = audio.createGain()
      gain.current.connect(audio.destination)
    }
    const unlock = (): void => {
      if (audio?.state === 'suspended')
        void audio
          .resume()
          .catch((error: unknown) => console.warn('Could not enable grenade preview audio', error))
    }
    window.addEventListener('pointerdown', unlock, true)
    const unavailable = (error: unknown): void => {
      if (!active) return
      console.warn('Could not load grenade preview effect', { skinId: skin.id, error })
      setFailed(true)
    }
    if (skin.explosionSpritePath)
      void window.api.skins
        .previewExplosionSprite(skin.id)
        .then((bytes) => {
          if (active) {
            if (bytes) setFrames(decodeExplosionSprite(bytes))
            else setFailed(true)
          }
        })
        .catch(unavailable)
    if (skin.actionSoundPath && audio)
      void window.api.skins
        .previewActionSound(skin.id)
        .then(async (bytes) => {
          if (!active) return
          if (!bytes) {
            setFailed(true)
            return
          }
          const decoded = await audio.decodeAudioData(bytes)
          if (active) setSound(decoded)
        })
        .catch(unavailable)
    void getCachedSkinModel(skin.id, skin.playerModelPath ?? '')
      .then((bytes) => {
        if (active) setProjectile(bytes)
      })
      .catch((error: unknown) =>
        console.warn('Thrown grenade model preview unavailable', { skinId: skin.id, error })
      )
    return () => {
      active = false
      window.removeEventListener('pointerdown', unlock, true)
      source.current?.stop()
      source.current?.disconnect()
      gain.current?.disconnect()
      context.current = null
      gain.current = null
      if (audio)
        void audio
          .close()
          .catch((error: unknown) => console.warn('Could not close grenade preview audio', error))
    }
  }, [skin.id, skin.explosionSpritePath, skin.actionSoundPath, skin.playerModelPath])
  useEffect(() => {
    if (gain.current) gain.current.gain.value = volume / 100
  }, [volume, sound])
  useEffect(() => {
    if (
      action !== 'explosion' ||
      !sound ||
      !context.current ||
      !gain.current ||
      lastSound.current === burst
    )
      return
    lastSound.current = burst
    source.current?.stop()
    source.current?.disconnect()
    const next = context.current.createBufferSource()
    next.buffer = sound
    next.connect(gain.current)
    source.current = next
    next.start()
  }, [action, burst, sound])
  useEffect(() => {
    if (!projectileVisible || !grenade.current || !root.current) return
    const { height } = root.current.getBoundingClientRect()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animation = grenade.current.animate(
      reduced
        ? [
            { transform: 'translate(0, 0) scale(.3)', opacity: 1 },
            { transform: 'translate(0, 0) scale(.3)', opacity: 1 }
          ]
        : [
            {
              transform: `translate(0, ${height * 0.24}px) scale(1) rotate(0deg)`,
              offset: 0
            },
            {
              transform: `translate(0, ${-height * 0.19}px) scale(.55) rotate(190deg)`,
              offset: 0.48
            },
            { transform: 'translate(0, 0) scale(.22) rotate(360deg)', offset: 1 }
          ],
      { duration: GRENADE_FLIGHT_MS, fill: 'both', easing: 'linear' }
    )
    return () => animation.cancel()
  }, [projectileVisible])
  useEffect(() => {
    if (action !== 'explosion' || !frames.length) return
    const target = canvas.current
    const drawing = target?.getContext('2d')
    if (!target || !drawing) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let request = 0
    const start = performance.now()
    let previous = -1
    const draw = (): void => {
      const elapsed = performance.now() - start
      const index = reduced
        ? Math.floor(frames.length / 2)
        : Math.min(frames.length - 1, Math.floor((elapsed / GRENADE_EXPLOSION_MS) * frames.length))
      if (previous !== index) {
        previous = index
        const frame = frames[index]!
        target.width = frame.width
        target.height = frame.height
        const pixels = drawing.createImageData(frame.width, frame.height)
        pixels.data.set(frame.pixels)
        drawing.putImageData(pixels, 0, 0)
      }
      if (!reduced && elapsed < GRENADE_EXPLOSION_MS) request = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(request)
  }, [action, burst, frames])
  return (
    <div
      ref={root}
      className={twMerge('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {projectile && (
        <div
          ref={grenade}
          aria-hidden="true"
          className="absolute top-[45%] left-1/2 size-28 -mt-14 -ml-14"
          style={{ visibility: projectileVisible ? 'visible' : 'hidden' }}
        >
          <ModelViewer
            modelBuffer={projectile}
            modelKey={`${skin.id}:projectile`}
            presentationRotation={rotation}
            camera={projectileCamera}
            cameraLocked
            animation={0}
            freezeAnimation
            maxFrameRate={24}
          />
        </div>
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        aria-hidden={action !== 'explosion' || !frames.length}
        className="absolute top-[45%] left-1/2 max-h-[60%] w-[38%] -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{
          visibility: action === 'explosion' && frames.length ? 'visible' : 'hidden',
          mixBlendMode: 'screen'
        }}
      />
      {failed && (
        <span
          role="status"
          className="absolute right-4 bottom-3 max-w-[45%] bg-black/45 px-2 py-1 text-right text-xs text-neutral-300"
        >
          {unavailableLabel}
        </span>
      )}
    </div>
  )
}
