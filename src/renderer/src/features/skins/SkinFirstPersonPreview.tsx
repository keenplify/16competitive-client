import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useStore } from 'zustand'
import {
  createFirstPersonPreviewStore,
  GRENADE_FLIGHT_MS,
  GRENADE_EXPLOSION_MS
} from './first-person-preview.store'
import { GrenadeThrowPreview } from './GrenadeThrowPreview'
import { LoaderCircle } from 'lucide-react'
import type { Skin } from '../../../../shared/skins'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { parseModelCached } from '../../libs/web-hlmv/lib/modelDataParser'
import { CrosshairPreview } from '../../components/CrosshairPreview'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { useTranslation } from '../i18n/i18n'
import { viewmodelNeedsMirror } from './viewmodel-presentation'
import translations from './skin-preview-translations.json'
import { getCachedSkinModel } from './skin-model-cache'

type Action = 'draw' | 'idle' | 'fire' | 'reload' | 'charge' | 'throw'
const labels: Record<Action, readonly string[]> = {
  draw: ['draw', 'deploy', 'draw1'],
  idle: ['idle1', 'idle', 'idle2'],
  fire: [
    'shoot1',
    'shoot',
    'fire',
    'fire1',
    'attack1',
    'midslash1',
    'slash1',
    'slash2',
    'stab',
    'throw'
  ],
  reload: ['reload', 'reload1'],
  charge: ['charge', 'pullpin', 'pull_pin', 'pinpull'],
  throw: ['throw', 'throw1', 'throw2']
}
const camera = { position: [0, 0, 0], target: [0, 0, 100], fov: 65, near: 0.1, far: 1000 } as const

export function SkinFirstPersonPreview({ skin }: { skin: Skin }): JSX.Element {
  const { language } = useTranslation()
  const text = translations[language]
  const isKnife = skin.weaponKey === 'knife'
  const isGrenade = ['hegrenade', 'flashbang', 'smokegrenade'].includes(skin.weaponKey)
  const kind = isGrenade ? 'grenade' : isKnife ? 'knife' : 'firearm'
  const playback = useMemo(() => createFirstPersonPreviewStore(kind), [kind])
  const { action, restart, held, spread, burst, fire, finish, settle } = useStore(playback)
  const crosshair = useGameSettingsStore((state) => state.crosshair)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [failed, setFailed] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true
    void getCachedSkinModel(skin.id, skin.viewModelPath ?? '', 'view').then(
      (bytes) => {
        if (active) setBuffer(bytes)
      },
      () => {
        if (active) setFailed(true)
      }
    )
    return () => {
      active = false
    }
  }, [skin.id, skin.viewModelPath])
  const sequences = useMemo(() => {
    if (!buffer) return null
    try {
      const model = parseModelCached(buffer)
      const idle = model.sequences.findIndex((s) => labels.idle.includes(s.label.toLowerCase()))
      const selected = Object.fromEntries(
        Object.entries(labels).map(([key, names]) => {
          const index = model.sequences.findIndex((s) => names.includes(s.label.toLowerCase()))
          return [key, index >= 0 ? index : Math.max(0, idle)]
        })
      ) as Record<Action, number>
      return {
        ...selected,
        prepared: [...new Set(Object.values(selected))],
        mirror: viewmodelNeedsMirror(model, Math.max(0, idle), skin.weaponKey)
      }
    } catch {
      return null
    }
  }, [buffer, skin.weaponKey])
  useEffect(() => {
    if (!held || kind !== 'firearm') return
    const timer = setInterval(fire, 100)
    return () => clearInterval(timer)
  }, [held, fire, kind])
  useEffect(() => {
    if (spread === 0) return
    const timer = setTimeout(settle, 90)
    return () => clearTimeout(timer)
  }, [spread, settle])
  useEffect(() => {
    const duration =
      action === 'flight' ? GRENADE_FLIGHT_MS : action === 'explosion' ? GRENADE_EXPLOSION_MS : null
    if (duration === null) return
    const timer = setTimeout(finish, duration)
    return () => clearTimeout(timer)
  }, [action, finish])
  useEffect(() => {
    const release = (): void => playback.getState().release()
    const cancel = (): void => playback.getState().cancel()
    const key = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyR' || event.repeat || kind !== 'firearm' || !buffer || !sequences)
        return
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return
      event.preventDefault()
      playback.getState().reload()
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [buffer, sequences, playback, kind])
  const sequenceAction =
    action === 'hold' ? 'charge' : action === 'flight' || action === 'explosion' ? 'throw' : action
  return (
    <div
      ref={stage}
      data-preview-action={action}
      className="absolute inset-0 overflow-hidden"
      onPointerDown={(event) => {
        if (event.button !== 0 || !buffer || !sequences) return
        event.currentTarget.setPointerCapture(event.pointerId)
        playback.getState().press()
      }}
    >
      {buffer && sequences ? (
        <>
          <div
            className="absolute inset-0"
            style={{
              transform: sequences.mirror ? 'scaleX(-1)' : undefined,
              visibility: action === 'flight' || action === 'explosion' ? 'hidden' : undefined
            }}
          >
            <ModelViewer
              modelBuffer={buffer}
              modelKey={`${skin.id}:view`}
              firstPerson
              camera={camera}
              cameraLocked
              animation={sequences[sequenceAction]}
              animationSequences={sequences.prepared}
              animationRestart={restart}
              playOnce={action !== 'idle'}
              onAnimationEnd={finish}
              freezeAnimation={action === 'hold' || action === 'flight' || action === 'explosion'}
              maxFrameRate={60}
              disableZoom
              className="absolute inset-0"
            />
          </div>
          {isGrenade && (
            <GrenadeThrowPreview
              skin={skin}
              action={action}
              burst={burst}
              label={text.grenadeExplosion}
              unavailableLabel={text.effectUnavailable}
            />
          )}
          <CrosshairPreview profile={crosshair} shotSpread={spread} label={text.crosshair} />
          <span className="pointer-events-none absolute bottom-3 left-4 bg-black/45 px-2 py-1 text-xs text-neutral-300">
            {isGrenade ? text.grenadeControls : isKnife ? text.knifeControls : text.controls}
          </span>
        </>
      ) : failed || (buffer && !sequences) ? (
        <p className="flex h-full items-center justify-center px-8 text-center text-sm text-neutral-300">
          {text.unavailable}
        </p>
      ) : (
        <div
          className="flex h-full items-center justify-center"
          role="status"
          aria-label={text.loading}
        >
          <LoaderCircle className="size-7 animate-spin text-sky-300" />
        </div>
      )}
    </div>
  )
}
