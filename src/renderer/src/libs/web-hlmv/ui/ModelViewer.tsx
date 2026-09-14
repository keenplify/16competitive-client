import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { Renderer, type ModelViewerCamera } from './Renderer'

type ModelViewerProps = {
  /** Model bytes obtained through a narrow, authenticated API. */
  modelBuffer?: ArrayBuffer
  /** Stable identity for a model buffer, used when changing previews. */
  modelKey?: string
  /** Changes whenever the backing source of an otherwise identical path changes. */
  sourceRevision?: string | number
  /** A renderer-accessible HTTP(S) or imported asset URL. */
  modelUrl?: string
  /** An MDL path relative to Counter-Strike's models directory. */
  modelPath?: string
  /** Rotation of the primary model skeleton around its root bone. */
  modelRootBoneRotation?: readonly [number, number, number]
  /** A companion MDL rendered in the same scene, such as a player-held weapon. */
  attachedModelPath?: string
  /** Local rotation for a companion MDL before it is merged into player bones. */
  attachedModelRotation?: readonly [number, number, number]
  /** Extra rotation around the animated right-hand bone after bone merging. */
  attachedModelHandRotation?: readonly [number, number, number]
  /** Hand-local XYZ delta applied to a companion model after bone merging. */
  attachedModelHandOffset?: readonly [number, number, number]
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
  /** Content shown when the requested model cannot be loaded. */
  fallback?: ReactNode
  /** Called immediately after the first successful WebGL frame. */
  onFirstFrame?: (canvas: HTMLCanvasElement) => void
  onLoadError?: (error: unknown) => void
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
  sourceRevision,
  modelUrl,
  modelPath,
  modelRootBoneRotation,
  attachedModelPath,
  attachedModelRotation,
  attachedModelHandRotation,
  attachedModelHandOffset,
  camera,
  cameraLocked = false,
  animation,
  maxFrameRate,
  presentationRotation,
  disableZoom = false,
  lockCameraDistance = false,
  orbitAngleLimit,
  rotateSpeed,
  fallback,
  onFirstFrame,
  onLoadError,
  className
}: ModelViewerProps): JSX.Element {
  const revision = sourceRevision === undefined ? '' : `@${sourceRevision}`
  const sourceKey = modelBuffer
    ? `buffer:${modelKey ?? 'default'}${revision}`
    : modelPath
      ? `path:${modelPath}${revision}`
      : `url:${modelUrl ?? ''}${revision}`
  const [loadedModel, setLoadedModel] = useState<{
    sourceKey: string
    buffer: ArrayBuffer
  } | null>(null)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const [attachedModel, setAttachedModel] = useState<{
    sourceKey: string
    buffer: ArrayBuffer
  } | null>(null)
  const attachedSourceKey = attachedModelPath ? `path:${attachedModelPath}${revision}` : ''

  useEffect(() => {
    const abortController = new AbortController()
    const requestedSourceKey = sourceKey

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
        onLoadError?.(error)
      })

    return () => abortController.abort()
  }, [modelBuffer, modelPath, modelUrl, onLoadError, sourceKey])

  useEffect(() => {
    if (!attachedModelPath) {
      return
    }

    const requestedSourceKey = attachedSourceKey
    let cancelled = false

    void window.api.models
      .read(attachedModelPath)
      .then((buffer) => {
        if (!cancelled) setAttachedModel({ sourceKey: requestedSourceKey, buffer })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAttachedModel(null)
          console.warn('[HLMV] ModelViewer companion model load failed', {
            modelPath: attachedModelPath,
            error
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [attachedModelPath, attachedSourceKey])

  return (
    <div className={twMerge('relative h-full w-full overflow-hidden', className)}>
      {loadedModel?.sourceKey === sourceKey && (
        <Renderer
          modelBuffer={loadedModel.buffer}
          modelRootBoneRotation={modelRootBoneRotation}
          attachedModelBuffer={
            attachedModel?.sourceKey === attachedSourceKey ? attachedModel.buffer : undefined
          }
          attachedModelRotation={attachedModelRotation}
          attachedModelHandRotation={attachedModelHandRotation}
          attachedModelHandOffset={attachedModelHandOffset}
          camera={camera}
          cameraLocked={cameraLocked}
          animation={animation}
          maxFrameRate={maxFrameRate}
          presentationRotation={presentationRotation}
          disableZoom={disableZoom}
          lockCameraDistance={lockCameraDistance}
          orbitAngleLimit={orbitAngleLimit}
          rotateSpeed={rotateSpeed}
          onFirstFrame={onFirstFrame}
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
      {failedSource === sourceKey && fallback && (
        <div className="absolute inset-0 flex items-center justify-center">{fallback}</div>
      )}
    </div>
  )
}
