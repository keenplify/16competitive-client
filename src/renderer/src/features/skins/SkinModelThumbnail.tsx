import { StickerViewport } from '../sticker-editor/StickerViewport'
import { previewAppliedStickers, useInventoryStore } from '../inventory/inventory.store'
import { stockWeaponPreview } from './stock-weapon-preview'
import { isGrenadeWeapon } from './weapon-categories'
import type { SkinPreviewRotation } from '../../../../shared/skin-preview-rotation'
import {
  characterWeaponAttachment,
  getSkinAnimation,
  isCharacterModel
} from './skin-model-presentation'
import { captureThumbnail } from './thumbnail-capture'
import { presentationModelPath } from '../party/party-models'
import { LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import elitePistolsImage from '../../assets/elite-pistols.png'
import { bundledWeaponPreview } from './bundled-weapon-previews'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { getCachedSkinModel } from './skin-model-cache'
import {
  getSkinCameraDistanceMultiplier,
  getSkinCameraTarget,
  getSkinPresentationRevision,
  getSkinPresentationRotation
} from './skin-model-presentation'

const MAX_ACTIVE_THUMBNAIL_RENDERERS = 2
const PREVIEW_THUMBNAIL_CACHE_ENABLED = true
let activeThumbnailRenderers = 0
const thumbnailQueue: Array<() => void> = []

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Invalid image'))
    )
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('Could not read image'))
    )
    reader.readAsDataURL(blob)
  })

const acquireRenderer = (): Promise<() => void> =>
  new Promise((resolve) => {
    const start = (): void => {
      activeThumbnailRenderers += 1
      let released = false
      resolve(() => {
        if (released) return
        released = true
        activeThumbnailRenderers -= 1
        thumbnailQueue.shift()?.()
      })
    }
    if (activeThumbnailRenderers < MAX_ACTIVE_THUMBNAIL_RENDERERS) start()
    else thumbnailQueue.push(start)
  })

interface SkinModelThumbnailProps {
  cacheKey: string
  weaponKey: string
  skinId?: string
  showAppliedStickers?: boolean
  modelPath?: string
  previewHiddenTextures?: string[]
  previewRotation?: SkinPreviewRotation
  sourceRevision?: string | number
  modelKey?: string
  fallback: ReactNode
  className?: string
}

export function SkinModelThumbnail(props: SkinModelThumbnailProps): JSX.Element {
  if (!isCharacterModel(props.weaponKey)) return <WeaponThumbnail {...props} />
  return (
    <SkinModelThumbnailContent
      key={`${props.cacheKey}:${props.sourceRevision ?? ''}:${getSkinPresentationRevision(props.weaponKey, props.previewRotation, props.previewHiddenTextures)}`}
      {...props}
    />
  )
}

function SkinModelThumbnailContent({
  cacheKey,
  weaponKey,
  skinId,
  modelPath,
  sourceRevision,
  previewRotation,
  previewHiddenTextures,
  modelKey,
  fallback,
  className
}: SkinModelThumbnailProps): JSX.Element {
  const [status, setStatus] = useState<'checking' | 'rendering' | 'ready' | 'failed'>('checking')
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | undefined>()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)
  const presentationRevision = getSkinPresentationRevision(
    weaponKey,
    previewRotation,
    previewHiddenTextures
  )
  const presentationCacheKey = `${cacheKey}:${sourceRevision ?? ''}:${presentationRevision}`
  const bundledPreview = bundledWeaponPreview(weaponKey, modelPath)
  const isStockModel = !skinId && /^(?:models\/)?p_[a-z0-9_]+\.mdl$/i.test(modelPath ?? '')

  const releaseRenderer = useCallback((): void => {
    releaseRef.current?.()
    releaseRef.current = null
  }, [])

  const fail = useCallback((): void => {
    if (!mountedRef.current) return
    releaseRenderer()
    setStatus('failed')
  }, [releaseRenderer])

  useEffect(() => {
    if (weaponKey === 'elite' || (isStockModel && bundledPreview)) return
    let active = true
    mountedRef.current = true

    const readThumbnail = PREVIEW_THUMBNAIL_CACHE_ENABLED
      ? window.api.models.readThumbnail(presentationCacheKey)
      : Promise.resolve(null)
    void readThumbnail.then(
      async (cached) => {
        if (!active) return
        if (cached) {
          const source = await blobToDataUrl(new Blob([cached], { type: 'image/png' }))
          if (!active) return
          setImageUrl(source)
          setStatus('ready')
          return
        }

        const release = await acquireRenderer()
        if (!active) {
          release()
          return
        }
        releaseRef.current = release
        if (skinId) {
          try {
            const buffer = await getCachedSkinModel(skinId, String(sourceRevision ?? ''))
            if (!active) return
            setModelBuffer(buffer)
          } catch {
            fail()
            return
          }
        }
        setStatus('rendering')
      },
      () => {
        if (active) fail()
      }
    )

    return () => {
      active = false
      mountedRef.current = false
      releaseRenderer()
    }
  }, [
    bundledPreview,
    fail,
    isStockModel,
    presentationCacheKey,
    releaseRenderer,
    skinId,
    sourceRevision,
    weaponKey
  ])

  const capture = useCallback(
    (canvas: HTMLCanvasElement): void => {
      void captureThumbnail(canvas)
        .then(async (blob) => {
          if (!mountedRef.current) return
          const source = await blobToDataUrl(blob)
          if (!mountedRef.current) return
          setImageUrl(source)
          setStatus('ready')
          releaseRenderer()
          if (PREVIEW_THUMBNAIL_CACHE_ENABLED) {
            void blob
              .arrayBuffer()
              .then((png) => window.api.models.writeThumbnail(presentationCacheKey, png))
              .catch((error: unknown) => console.warn('Could not persist model thumbnail', error))
          }
        })
        .catch(fail)
    },
    [fail, presentationCacheKey, releaseRenderer]
  )

  return (
    <span className={twMerge('relative block h-full w-full', className)}>
      {weaponKey === 'elite' && (
        <img
          className="h-full w-full object-contain"
          src={bundledPreview ?? elitePistolsImage}
          alt=""
          draggable={false}
        />
      )}
      {weaponKey !== 'elite' && isStockModel && bundledPreview && (
        <img
          className="h-full w-full object-contain"
          src={bundledPreview}
          alt=""
          draggable={false}
        />
      )}
      {weaponKey !== 'elite' && !isStockModel && status === 'ready' && imageUrl && (
        <img className="h-full w-full object-contain" src={imageUrl} alt="" draggable={false} />
      )}
      {weaponKey !== 'elite' &&
        !(isStockModel && bundledPreview) &&
        status === 'rendering' &&
        (!skinId || modelBuffer) && (
          <ModelViewer
            key={presentationRevision}
            hideHandHelpers={isGrenadeWeapon(weaponKey)}
            hiddenTextures={previewHiddenTextures}
            modelBuffer={modelBuffer}
            modelKey={`${modelKey ?? cacheKey}:${presentationRevision}`}
            modelPath={
              modelPath && isCharacterModel(weaponKey)
                ? presentationModelPath(modelPath)
                : modelPath
            }
            sourceRevision={sourceRevision}
            presentationRotation={getSkinPresentationRotation(weaponKey, previewRotation)}
            camera={{
              distanceMultiplier: getSkinCameraDistanceMultiplier(weaponKey, 0.5),
              target: getSkinCameraTarget(weaponKey)
            }}
            animation={getSkinAnimation(weaponKey)}
            {...characterWeaponAttachment(weaponKey)}
            maxFrameRate={20}
            cameraLocked
            onFirstFrame={capture}
            onLoadError={fail}
            className="absolute inset-0"
          />
        )}
      {weaponKey !== 'elite' &&
        !(isStockModel && bundledPreview) &&
        (status === 'checking' || (status === 'rendering' && skinId && !modelBuffer)) && (
          <span className="absolute inset-0 flex items-center justify-center" role="status">
            {bundledPreview && (
              <img
                className="absolute inset-0 h-full w-full object-contain"
                src={bundledPreview}
                alt=""
                draggable={false}
              />
            )}
            <LoaderCircle className="size-5 animate-spin text-sky-300" />
          </span>
        )}
      {weaponKey !== 'elite' && status === 'failed' && (
        <span className="absolute inset-0 flex items-center justify-center">
          {bundledPreview ? (
            <img
              className="h-full w-full object-contain"
              src={bundledPreview}
              alt=""
              draggable={false}
            />
          ) : (
            fallback
          )}
        </span>
      )}
    </span>
  )
}

// Bump this namespace whenever the rendered weapon presentation changes.
const WEAPON_PREVIEW_VERSION = 'viewmodel-inspection-v6'
function WeaponThumbnail(props: SkinModelThumbnailProps): JSX.Element {
  const target = props.skinId ? `skin:${props.skinId}` : `stock:${props.weaponKey}`
  const stickers = useInventoryStore((s) =>
    JSON.stringify(
      props.showAppliedStickers
        ? (s.snapshot?.items.filter((i) => i.weaponKey === target) ?? [])
        : []
    )
  )
  let revision = 2166136261
  for (const character of stickers)
    revision = Math.imul(revision ^ character.charCodeAt(0), 16777619)
  const key = `${WEAPON_PREVIEW_VERSION}:${props.cacheKey}:${props.sourceRevision ?? ''}:${revision >>> 0}`
  return <WeaponThumbnailContent key={key} {...props} thumbnailKey={key} target={target} />
}
function WeaponThumbnailContent({
  thumbnailKey,
  target,
  ...props
}: SkinModelThumbnailProps & { thumbnailKey: string; target: string }): JSX.Element {
  const [buffer, setBuffer] = useState<ArrayBuffer>()
  const [image, setImage] = useState<string>()
  const [failed, setFailed] = useState(false)
  const active = useRef(false)
  const release = useRef<(() => void) | null>(null)
  useEffect(() => {
    let cancelled = false
    active.current = true
    void (async () => {
      try {
        const cached = await window.api.models.readThumbnail(thumbnailKey)
        if (cancelled) return
        if (cached) {
          const url = await blobToDataUrl(new Blob([cached], { type: 'image/png' }))
          if (!cancelled) setImage(url)
          return
        }
        const done = await acquireRenderer()
        if (cancelled) {
          done()
          return
        }
        release.current = done
        const bytes = props.skinId
          ? await getCachedSkinModel(props.skinId, String(props.sourceRevision ?? ''), 'view')
          : await window.api.models.read(stockWeaponPreview(props.weaponKey, '').viewModelPath!)
        const decorated =
          props.showAppliedStickers && useInventoryStore.getState().snapshot
            ? await previewAppliedStickers(bytes, target)
            : bytes
        if (!cancelled) setBuffer(decorated)
      } catch {
        if (!cancelled) {
          setFailed(true)
          release.current?.()
          release.current = null
        }
      }
    })()
    return () => {
      cancelled = true
      active.current = false
      release.current?.()
      release.current = null
    }
  }, [
    thumbnailKey,
    target,
    props.skinId,
    props.sourceRevision,
    props.weaponKey,
    props.showAppliedStickers
  ])
  const fail = useCallback(() => {
    if (active.current) {
      setFailed(true)
      release.current?.()
      release.current = null
    }
  }, [])
  const capture = useCallback(
    (canvas: HTMLCanvasElement) => {
      void captureThumbnail(canvas)
        .then(async (blob) => {
          const url = await blobToDataUrl(blob)
          if (!active.current) return
          setImage(url)
          release.current?.()
          release.current = null
          await window.api.models.writeThumbnail(thumbnailKey, await blob.arrayBuffer())
        })
        .catch((error: unknown) => {
          console.warn('Could not capture weapon thumbnail', error)
          if (active.current) {
            setFailed(true)
            release.current?.()
            release.current = null
          }
        })
    },
    [thumbnailKey]
  )
  return (
    <span className={twMerge('relative block h-full w-full', props.className)}>
      {image ? (
        <img className="h-full w-full object-contain" src={image} alt="" draggable={false} />
      ) : failed ? (
        props.fallback
      ) : buffer ? (
        <span className="absolute inset-0 overflow-hidden">
          {/* Cache one stable aspect ratio, independent of the card that renders first. */}
          <span
            className="pointer-events-none absolute opacity-0"
            style={{ width: 512, height: 256 }}
          >
            <StickerViewport
              label=""
              previewModel={buffer}
              weaponKey={props.weaponKey}
              onFirstFrame={capture}
              onError={fail}
            />
          </span>
          <span className="absolute inset-0 flex items-center justify-center" role="status">
            <LoaderCircle className="size-5 animate-spin text-sky-300" />
          </span>
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center" role="status">
          <LoaderCircle className="size-5 animate-spin text-sky-300" />
        </span>
      )}
    </span>
  )
}
