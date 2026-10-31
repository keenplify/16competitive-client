import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { Skin } from '../../../../shared/skins'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { parseModelCached } from '../../libs/web-hlmv/lib/modelDataParser'
import { CrosshairPreview } from '../../components/CrosshairPreview'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { useTranslation } from '../i18n/i18n'
import translations from './skin-preview-translations.json'
import { getCachedSkinModel } from './skin-model-cache'

type Action = 'draw' | 'idle' | 'fire' | 'reload'
const labels: Record<Action, readonly string[]> = {
  draw: ['draw', 'deploy', 'draw1'],
  idle: ['idle1', 'idle', 'idle2'],
  fire: ['shoot1', 'shoot', 'fire', 'fire1', 'attack1', 'slash1', 'throw'],
  reload: ['reload', 'reload1']
}
const camera = { position: [0, 0, 0], target: [0, 0, 100], fov: 65, near: 0.1, far: 1000 } as const

export function SkinFirstPersonPreview({ skin }: { skin: Skin }): JSX.Element {
  const { language } = useTranslation()
  const text = translations[language]
  const crosshair = useGameSettingsStore((state) => state.crosshair)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [failed, setFailed] = useState(false)
  const [action, setAction] = useState<Action>('draw')
  const [restart, setRestart] = useState(0)
  const [held, setHeld] = useState(false)
  const [spread, setSpread] = useState(0)
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
      return Object.fromEntries(
        Object.entries(labels).map(([key, names]) => {
          const index = model.sequences.findIndex((s) => names.includes(s.label.toLowerCase()))
          return [key, index >= 0 ? index : Math.max(0, idle)]
        })
      ) as Record<Action, number>
    } catch {
      return null
    }
  }, [buffer])
  const play = useCallback((next: Action) => {
    setAction(next)
    setRestart((n) => n + 1)
  }, [])
  const fire = useCallback(() => {
    play('fire')
    setSpread((n) => Math.min(8, n + 2))
  }, [play])
  useEffect(() => {
    if (!held) return
    const timer = setInterval(fire, 100)
    return () => clearInterval(timer)
  }, [held, fire])
  useEffect(() => {
    if (spread === 0) return
    const timer = setTimeout(() => setSpread((n) => Math.max(0, n - 1)), 90)
    return () => clearTimeout(timer)
  }, [spread])
  useEffect(() => {
    const release = (): void => setHeld(false)
    const key = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyR' || event.repeat || !buffer || !sequences) return
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return
      event.preventDefault()
      release()
      play('reload')
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
    }
  }, [buffer, sequences, play])
  const ended = useCallback(() => {
    if (!held) setAction('idle')
  }, [held])
  return (
    <div
      ref={stage}
      className="absolute inset-0 overflow-hidden"
      onPointerDown={(event) => {
        if (event.button !== 0 || !buffer || !sequences) return
        event.currentTarget.setPointerCapture(event.pointerId)
        setHeld(true)
        fire()
      }}
    >
      {buffer && sequences ? (
        <>
          <div className="absolute inset-0" style={{ transform: 'scaleX(-1)' }}>
            <ModelViewer
              modelBuffer={buffer}
              modelKey={`${skin.id}:view`}
              firstPerson
              camera={camera}
              cameraLocked
              animation={sequences[action]}
              animationRestart={restart}
              playOnce={action !== 'idle'}
              onAnimationEnd={ended}
              maxFrameRate={60}
              disableZoom
              className="absolute inset-0"
            />
          </div>
          <CrosshairPreview profile={crosshair} shotSpread={spread} label={text.crosshair} />
          <span className="pointer-events-none absolute bottom-3 left-4 bg-black/45 px-2 py-1 text-xs text-neutral-300">
            {text.controls}
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
