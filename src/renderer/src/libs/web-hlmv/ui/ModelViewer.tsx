import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Renderer, type ModelViewerCamera } from './Renderer'

type ModelViewerProps = {
  /** Model bytes obtained through a narrow, authenticated API. */
  modelBuffer?: ArrayBuffer
  /** Stable identity for a model buffer, used when changing previews. */
  modelKey?: string
  /** A renderer-accessible HTTP(S) or imported asset URL. */
  modelUrl?: string
  /** An MDL path relative to Counter-Strike's models directory. */
  modelPath?: string
  camera?: ModelViewerCamera
  cameraLocked?: boolean
  /** Sequence label (for example, `idle1`) or zero-based sequence index. */
  animation?: string | number
  /** Caps canvas rendering while keeping the animation time in sync. */
  maxFrameRate?: number
  /** Rotation in degrees that affects only this model's initial presentation. */
  presentationRotation?: readonly [number, number, number]
  /** Turns off dolly/scroll zoom while retaining the viewer's normal drag controls. */
  disableZoom?: boolean
  /** Keeps a preview's orbit radius fixed while dragging. */
  lockCameraDistance?: boolean
  /** Limits horizontal orbit around the initial face; use for constrained previews. */
  orbitAngleLimit?: number
  /** Multiplier for drag rotation speed. */
  rotateSpeed?: number
  className?: string
}

/**
 * Displays a GoldSrc MDL from a renderer-accessible URL on a transparent canvas.
 * Use an imported asset URL or an HTTPS URL; filesystem paths must stay in the
 * Electron main process and be exposed through a narrow preload API first.
 */
export function ModelViewer({
  modelBuffer,
  modelKey,
  modelUrl,
  modelPath,
  camera,
  cameraLocked = false,
  animation,
  maxFrameRate,
  presentationRotation,
  disableZoom = false,
  lockCameraDistance = false,
  orbitAngleLimit,
  rotateSpeed,
  className
}: ModelViewerProps): JSX.Element {
  const sourceKey = modelBuffer
    ? `buffer:${modelKey ?? 'default'}`
    : modelPath
      ? `path:${modelPath}`
      : `url:${modelUrl ?? ''}`
  const [loadedModel, setLoadedModel] = useState<{
    sourceKey: string
    buffer: ArrayBuffer
  } | null>(null)
  const [failedSource, setFailedSource] = useState<string | null>(null)

  useEffect(() => {
    const abortController = new AbortController()
    const requestedSourceKey = modelBuffer
      ? `buffer:${modelKey ?? 'default'}`
      : modelPath
        ? `path:${modelPath}`
        : `url:${modelUrl ?? ''}`

    const modelRequest = modelBuffer
      ? Promise.resolve(modelBuffer)
      : modelPath
        ? window.api.models.read(modelPath)
        : modelUrl
          ? fetch(modelUrl, { signal: abortController.signal }).then((response) => {
              if (!response.ok) {
                throw new Error(`Could not load model (${response.status})`)
              }

              return response.arrayBuffer()
            })
          : Promise.reject(new Error('ModelViewer requires modelUrl or modelPath'))

    void modelRequest
      .then((buffer) => {
        setLoadedModel({ sourceKey: requestedSourceKey, buffer })
        setFailedSource(null)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        console.error('[HLMV] ModelViewer model load failed', { modelUrl, modelPath, error })
        setFailedSource(requestedSourceKey)
      })

    return () => abortController.abort()
  }, [modelBuffer, modelKey, modelPath, modelUrl])

  return (
    <div className={twMerge('relative h-full w-full overflow-hidden', className)}>
      {loadedModel?.sourceKey === sourceKey && (
        <Renderer
          modelBuffer={loadedModel.buffer}
          camera={camera}
          cameraLocked={cameraLocked}
          animation={animation}
          maxFrameRate={maxFrameRate}
          presentationRotation={presentationRotation}
          disableZoom={disableZoom}
          lockCameraDistance={lockCameraDistance}
          orbitAngleLimit={orbitAngleLimit}
          rotateSpeed={rotateSpeed}
          className="h-full w-full"
          setModelController={() => undefined}
          setModelData={() => undefined}
        />
      )}
      {failedSource !== sourceKey && loadedModel?.sourceKey !== sourceKey && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          role="status"
          aria-label="Loading model"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-sky-400" />
        </div>
      )}
    </div>
  )
}
