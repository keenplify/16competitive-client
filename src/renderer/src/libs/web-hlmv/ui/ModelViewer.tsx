import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Renderer, type ModelViewerCamera } from './Renderer'

type ModelViewerProps = {
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
  className?: string
}

/**
 * Displays a GoldSrc MDL from a renderer-accessible URL on a transparent canvas.
 * Use an imported asset URL or an HTTPS URL; filesystem paths must stay in the
 * Electron main process and be exposed through a narrow preload API first.
 */
export function ModelViewer({
  modelUrl,
  modelPath,
  camera,
  cameraLocked = false,
  animation,
  maxFrameRate,
  className
}: ModelViewerProps): JSX.Element {
  const sourceKey = modelPath ? `path:${modelPath}` : `url:${modelUrl ?? ''}`
  const [loadedModel, setLoadedModel] = useState<{
    sourceKey: string
    buffer: ArrayBuffer
  } | null>(null)

  useEffect(() => {
    const abortController = new AbortController()
    const requestedSourceKey = modelPath ? `path:${modelPath}` : `url:${modelUrl ?? ''}`

    const modelRequest = modelPath
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
      .then((buffer) => setLoadedModel({ sourceKey: requestedSourceKey, buffer }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        console.error('[HLMV] ModelViewer model load failed', { modelUrl, modelPath, error })
      })

    return () => abortController.abort()
  }, [modelPath, modelUrl])

  return (
    <div className={twMerge('relative h-full w-full overflow-hidden', className)}>
      {loadedModel?.sourceKey === sourceKey && (
        <Renderer
          modelBuffer={loadedModel.buffer}
          camera={camera}
          cameraLocked={cameraLocked}
          animation={animation}
          maxFrameRate={maxFrameRate}
          className="h-full w-full"
          setModelController={() => undefined}
          setModelData={() => undefined}
        />
      )}
    </div>
  )
}
