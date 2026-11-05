import { useEffect, useRef } from 'react'
import type { MuzzleFlashSource } from '../../libs/web-hlmv/lib/muzzle-flash'
import { decodeExplosionSprite, type SpriteFrame } from '../operations/explosion-sprite'
import { useAudioSettingsStore } from '../audio/audio.store'
import type { Skin } from '../../../../shared/skins'

/** Short-lived preview effects; decoded once, bounded voices, no gameplay state. */
export function GunPreviewEffects({
  skin,
  shot,
  firing,
  muzzleFlash
}: {
  skin: Skin
  shot: number
  firing: boolean
  muzzleFlash: MuzzleFlashSource
}) {
  const frames = useRef<SpriteFrame[]>([])
  const audio = useRef<AudioContext | null>(null)
  const sound = useRef<AudioBuffer | null>(null)
  const voices = useRef<AudioBufferSourceNode[]>([])
  const volume = useAudioSettingsStore((state) => state.sfxVolume)
  useEffect(() => {
    let active = true
    const context = new AudioContext()
    audio.current = context
    const unlock = () => {
      if (context.state === 'suspended') void context.resume().catch(() => undefined)
    }
    window.addEventListener('pointerdown', unlock, true)
    void window.api.skins
      .previewExplosionSprite(skin.id)
      .then((bytes) => {
        if (active && bytes) frames.current = decodeExplosionSprite(bytes)
      })
      .catch((error) => console.warn('Muzzle preview unavailable', error))
    void window.api.skins
      .previewActionSound(skin.id)
      .then(async (bytes) => {
        if (!bytes || !active) return
        const decoded = await context.decodeAudioData(bytes)
        if (active) sound.current = decoded
      })
      .catch((error) => console.warn('Weapon preview sound unavailable', error))
    return () => {
      active = false
      frames.current = []
      sound.current = null
      audio.current = null
      window.removeEventListener('pointerdown', unlock, true)
      for (const voice of voices.current) {
        voice.stop()
        voice.disconnect()
      }
      voices.current = []
      void context.close().catch(() => undefined)
    }
  }, [skin.id, skin.explosionSpritePath, skin.actionSoundPath])
  useEffect(() => {
    if (!firing) return
    const context = audio.current
    if (context && sound.current && volume > 0 && context.state === 'running') {
      while (voices.current.length >= 4) {
        const old = voices.current.shift()!
        old.stop()
        old.disconnect()
      }
      const voice = context.createBufferSource(),
        gain = context.createGain()
      voice.buffer = sound.current
      gain.gain.value = volume / 100
      voice.connect(gain)
      gain.connect(context.destination)
      voices.current.push(voice)
      voice.onended = () => {
        voice.disconnect()
        gain.disconnect()
        voices.current = voices.current.filter((item) => item !== voice)
      }
      voice.start()
    }
    const target = muzzleFlash.canvas,
      ctx = target.getContext('2d')
    if (!target || !ctx || !frames.current.length || skin.weaponKey === 'tmp') return
    let request = 0
    const start = performance.now()
    const draw = () => {
      const elapsed = performance.now() - start
      if (elapsed >= 80) {
        muzzleFlash.visible = false
        return
      }
      const frame =
        frames.current[
          Math.min(frames.current.length - 1, Math.floor((elapsed / 80) * frames.current.length))
        ]
      target.width = frame.width
      target.height = frame.height
      const image = ctx.createImageData(frame.width, frame.height)
      image.data.set(frame.pixels)
      ctx.putImageData(image, 0, 0)
      muzzleFlash.revision++
      muzzleFlash.visible = true
      request = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(request)
      muzzleFlash.visible = false
    }
  }, [shot, firing, muzzleFlash, skin.weaponKey, volume])
  return null
}
