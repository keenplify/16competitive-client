import { LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import elitePistolsImage from '../../assets/elite-pistols.png'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { getCachedSkinModel } from './skin-model-cache'
import {
  getSkinCameraDistanceMultiplier,
  getSkinCameraTarget,
  getSkinPresentationRotation
} from './skin-model-presentation'

const MAX_ACTIVE_THUMBNAIL_RENDERERS = 2
// Keep previews uncached during visual testing; this forces a fresh render.
const PREVIEW_THUMBNAIL_CACHE_ENABLED = false
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
  modelPath?: string
  sourceRevision?: string | number
  modelKey?: string
  fallback: ReactNode
  className?: string
}

export function SkinModelThumbnail({
  cacheKey,
  weaponKey,
  skinId,
  modelPath,
  sourceRevision,
  modelKey,
  fallback,
  className
}: SkinModelThumbnailProps): JSX.Element {
  const [status, setStatus] = useState<'checking' | 'rendering' | 'ready' | 'failed'>('checking')
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | undefined>()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)

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
    if (weaponKey === 'elite') return
    let active = true
    mountedRef.current = true
    const readThumbnail = PREVIEW_THUMBNAIL_CACHE_ENABLED
      ? window.api.models.readThumbnail(cacheKey)
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
            const buffer = await getCachedSkinModel(skinId)
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
  }, [cacheKey, fail, releaseRenderer, skinId, weaponKey])

  const capture = useCallback(
    (canvas: HTMLCanvasElement): void => {
      canvas.toBlob((blob) => {
        if (!mountedRef.current || !blob) {
          fail()
          return
        }
        void Promise.all([
          blobToDataUrl(blob),
          PREVIEW_THUMBNAIL_CACHE_ENABLED
            ? blob
                .arrayBuffer()
                .then((png) => window.api.models.writeThumbnail(cacheKey, png))
                .catch((error: unknown) => console.warn('Could not persist model thumbnail', error))
            : Promise.resolve()
        ]).then(([source]) => {
          if (!mountedRef.current) return
          setImageUrl(source)
          setStatus('ready')
          releaseRenderer()
        }, fail)
      }, 'image/png')
    },
    [cacheKey, fail, releaseRenderer]
  )

  return (
    <span className={twMerge('relative block h-full w-full', className)}>
      {weaponKey === 'elite' && (
        <img
          className="h-full w-full object-contain"
          src={elitePistolsImage}
          alt=""
          draggable={false}
        />
      )}
      {weaponKey !== 'elite' && status === 'ready' && imageUrl && (
        <img className="h-full w-full object-contain" src={imageUrl} alt="" draggable={false} />
      )}
      {weaponKey !== 'elite' && status === 'rendering' && (!skinId || modelBuffer) && (
        <ModelViewer
          modelBuffer={modelBuffer}
          modelKey={modelKey ?? cacheKey}
          modelPath={modelPath}
          sourceRevision={sourceRevision}
          presentationRotation={getSkinPresentationRotation(weaponKey)}
          camera={{
            distanceMultiplier: getSkinCameraDistanceMultiplier(weaponKey, 0.5),
            target: getSkinCameraTarget(weaponKey)
          }}
          animation="idle1"
          maxFrameRate={20}
          cameraLocked
          onFirstFrame={capture}
          onLoadError={fail}
          className="absolute inset-0"
        />
      )}
      {weaponKey !== 'elite' && (status === 'checking' || (status === 'rendering' && skinId && !modelBuffer)) && (
        <span className="absolute inset-0 flex items-center justify-center" role="status">
          <LoaderCircle className="size-5 animate-spin text-sky-300" />
        </span>
      )}
      {weaponKey !== 'elite' && status === 'failed' && (
        <span className="absolute inset-0 flex items-center justify-center">{fallback}</span>
      )}
    </span>
  )
}
