/* eslint-disable react-hooks/exhaustive-deps */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck bad types

import * as React from 'react'
import { ModelData, parseModel } from '../lib/modelDataParser'
import { buildTexture } from '../lib/textureBuilder'
import {
  prepareRenderData,
  createModelMeshes,
  createContainer,
  createTexture
} from '../lib/modelRenderer'
import { createModelController, ModelController } from '../lib/modelController'
import {
  createOrbitControls,
  createRenderer,
  createCamera,
  createLights,
  createTimer,
  createScene
} from '../lib/screneRenderer'
import THREE from '../lib/three'

export type WindowSize = {
  width: number
  height: number
}

export type ModelViewerCamera = {
  position?: readonly [number, number, number]
  target?: readonly [number, number, number]
  /** Direction from the model center when automatically framing a model. */
  direction?: readonly [number, number, number]
  /** Framing scale; values below 1 move the initial camera closer. */
  distanceMultiplier?: number
  fov?: number
  near?: number
  far?: number
}

type WindowSizeSensorProps = {
  target?: HTMLElement | null
  onChange?: (size: WindowSize) => void
  children: (state: WindowSize) => React.ReactNode
}

export const WindowSizeSensor = ({
  target,
  onChange,
  children
}: WindowSizeSensorProps): React.JSX.Element => {
  const [size, setSize] = React.useState<WindowSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0
  })

  // Keep a mutable reference to the latest onChange callback
  // so we don't need to add it to the useEffect dependency array.
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  React.useEffect(() => {
    const handleResize = (): void => {
      const bounds = target?.getBoundingClientRect()
      const newSize = bounds
        ? { width: bounds.width, height: bounds.height }
        : { width: window.innerWidth, height: window.innerHeight }

      setSize(newSize)

      if (onChangeRef.current) {
        onChangeRef.current(newSize)
      }
    }

    // Call it once on mount to ensure the Three.js renderer and camera
    // get correctly sized before the user resizes the window for the first time.
    handleResize()

    const resizeObserver = target ? new ResizeObserver(handleResize) : undefined
    resizeObserver?.observe(target)
    window.addEventListener('resize', handleResize)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [target])

  // Execute the render prop function, passing the current width and height
  return <>{children(size)}</>
}

const useAnimationFrame = function <T extends (...args: unknown[]) => void>(callback: T): void {
  const callbackRef = React.useRef(callback)
  React.useEffect(() => (callbackRef.current = callback), [callback])

  const loop = (): void => {
    frameRef.current = requestAnimationFrame(loop)

    callbackRef.current()
  }

  const frameRef = React.useRef<number>(null)

  React.useLayoutEffect(() => {
    frameRef.current = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(frameRef.current!)
  }, [])
}

type Props = {
  modelBuffer: ArrayBuffer
  setModelController: (controller: ModelController) => void
  setModelData: (modelData: ModelData) => void
  camera?: ModelViewerCamera
  cameraLocked?: boolean
  animation?: string | number
  maxFrameRate?: number
  presentationRotation?: readonly [number, number, number]
  disableZoom?: boolean
  lockCameraDistance?: boolean
  /** Restricts orbit around the initial face by this many radians on each side. */
  orbitAngleLimit?: number
  rotateSpeed?: number
  className?: string
}

export const Renderer = (props: Props): React.JSX.Element => {
  // Canvas reference
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null)
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null)
  const hasRenderedFirstFrame = React.useRef(false)
  const lastSlowFrameLogAt = React.useRef(0)
  const lastRenderAt = React.useRef(0)
  const orbitDistance = React.useRef<number | null>(null)
  const canvasRef = React.useCallback((element: HTMLCanvasElement | null) => {
    setCanvas(element)
  }, [])

  // Camera
  const camera = React.useMemo(() => createCamera(), [])
  // Timer
  const timer = React.useMemo(() => createTimer(), [])
  const scene = React.useMemo(() => createScene(), [])

  // Three renderer
  const renderer: THREE.WebGLRenderer | null = React.useMemo(() => {
    if (!canvas) {
      return null
    }

    console.info('[HLMV] Creating WebGL renderer')
    return createRenderer(canvas)
  }, [canvas])

  // Orbit controller
  const orbitControls: THREE.OrbitControls | null = React.useMemo(() => {
    if (!canvas || props.cameraLocked) {
      return null
    }

    return createOrbitControls(
      camera,
      canvas,
      props.disableZoom,
      props.orbitAngleLimit !== undefined,
      props.rotateSpeed
    )
  }, [
    camera,
    canvas,
    props.cameraLocked,
    props.disableZoom,
    props.orbitAngleLimit,
    props.rotateSpeed
  ])

  // Scene lights
  // Note: you can pass lights color to arguments
  const lights = React.useMemo(() => createLights(), [])

  React.useEffect(() => {
    if (!canvas) {
      return
    }

    const onWebglContextLost = (event: Event): void => {
      event.preventDefault()
      console.error('[HLMV] WebGL context lost')
    }
    const onWebglContextRestored = (): void => {
      console.info('[HLMV] WebGL context restored')
    }

    console.info('[HLMV] Render canvas mounted')
    canvas.addEventListener('webglcontextlost', onWebglContextLost)
    canvas.addEventListener('webglcontextrestored', onWebglContextRestored)

    return () => {
      canvas.removeEventListener('webglcontextlost', onWebglContextLost)
      canvas.removeEventListener('webglcontextrestored', onWebglContextRestored)
    }
  }, [canvas])

  // Parsing the model buffer
  const modelData: ModelData = React.useMemo(() => {
    const startedAt = performance.now()
    console.info('[HLMV] Parsing model', { bytes: props.modelBuffer.byteLength })
    try {
      const parsedModel = parseModel(props.modelBuffer)
      console.info('[HLMV] Model parsed', {
        milliseconds: Math.round(performance.now() - startedAt),
        sequences: parsedModel.sequences.length,
        textures: parsedModel.textures.length,
        meshes: parsedModel.meshes.flat(2).length
      })
      return parsedModel
    } catch (error) {
      console.error('[HLMV] Model parsing failed', {
        bytes: props.modelBuffer.byteLength,
        milliseconds: Math.round(performance.now() - startedAt),
        error
      })
      throw error
    }
  }, [props.modelBuffer])

  const animationIndex = React.useMemo(() => {
    if (typeof props.animation === 'number') {
      return Math.max(0, Math.min(Math.floor(props.animation), modelData.sequences.length - 1))
    }

    if (typeof props.animation === 'string') {
      const requestedLabel = props.animation.toLowerCase()
      const index = modelData.sequences.findIndex(
        (sequence) => sequence.label.toLowerCase() === requestedLabel
      )

      if (index >= 0) {
        return index
      }

      console.warn('[HLMV] Requested animation sequence was not found; using the first sequence', {
        requested: props.animation,
        available: modelData.sequences.map((sequence) => sequence.label)
      })
    }

    return 0
  }, [modelData, props.animation])

  // Meshes render
  const meshesRenderData = React.useMemo(() => {
    const startedAt = performance.now()
    console.info('[HLMV] Preparing render data')
    try {
      const preparedRenderData = prepareRenderData(
        modelData,
        props.animation === undefined ? undefined : [animationIndex]
      )
      console.info('[HLMV] Render data prepared', {
        milliseconds: Math.round(performance.now() - startedAt)
      })
      return preparedRenderData
    } catch (error) {
      console.error('[HLMV] Render-data preparation failed', {
        milliseconds: Math.round(performance.now() - startedAt),
        error
      })
      throw error
    }
  }, [animationIndex, modelData, props.animation])

  // Textures preparing
  const textures = React.useMemo(() => {
    const startedAt = performance.now()
    console.info('[HLMV] Preparing textures', { textures: modelData.textures.length })
    try {
      const preparedTextures = modelData.textures.map((texture) =>
        buildTexture(props.modelBuffer, texture)
      )
      console.info('[HLMV] Textures prepared', {
        milliseconds: Math.round(performance.now() - startedAt),
        textures: preparedTextures.length
      })
      return preparedTextures
    } catch (error) {
      console.error('[HLMV] Texture preparation failed', {
        milliseconds: Math.round(performance.now() - startedAt),
        error
      })
      throw error
    }
  }, [modelData, props.modelBuffer])

  // Generation meshes
  const meshes = React.useMemo(() => {
    const startedAt = performance.now()
    console.info('[HLMV] Creating model meshes')
    try {
      const createdMeshes = createModelMeshes(meshesRenderData, modelData, textures)
      console.info('[HLMV] Model meshes created', {
        milliseconds: Math.round(performance.now() - startedAt)
      })
      return createdMeshes
    } catch (error) {
      console.error('[HLMV] Model mesh creation failed', {
        milliseconds: Math.round(performance.now() - startedAt),
        error
      })
      throw error
    }
  }, [meshesRenderData, modelData, textures])

  // Creating model controller
  const controller: ModelController = React.useMemo(() => {
    console.info('[HLMV] Creating model controller')
    const createdController = createModelController(
      meshes,
      meshesRenderData,
      modelData,
      animationIndex
    )
    console.info('[HLMV] Model controller created')
    return createdController
  }, [animationIndex, meshes, meshesRenderData, modelData])

  // Mesh container
  const container = React.useMemo(
    () => createContainer(meshes, props.presentationRotation),
    [meshes, props.presentationRotation]
  )

  // Renderer-native static fallback for legacy material/morph pipelines that
  // fail to issue draw calls in modern module-based builds.
  const fallbackContainer = React.useMemo(() => {
    const fallback = new THREE.Group()

    meshesRenderData.forEach((bodyPart, bodyPartIndex) =>
      bodyPart.forEach((subModel, subModelIndex) =>
        subModel.forEach(({ geometryBuffers, uvMap }, meshIndex) => {
          const sourcePosition = geometryBuffers[animationIndex][0]
          const geometry = new THREE.BufferGeometry()
          geometry.addAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(sourcePosition.array), 3)
          )
          geometry.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvMap.array), 2))

          const sourceMesh = modelData.meshes[bodyPartIndex][subModelIndex][meshIndex]
          const textureIndex = modelData.skinRef[sourceMesh.skinRef]
          const textureData = textures[textureIndex]
          const textureInfo = modelData.textures[textureIndex]
          const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.5
          })

          if (textureData && textureInfo) {
            material.map = createTexture(textureData, textureInfo.width, textureInfo.height)
          }

          const fallbackMesh = new THREE.Mesh(geometry, material)
          fallbackMesh.userData.geometryBuffers = geometryBuffers
          fallback.add(fallbackMesh)
        })
      )
    )

    fallback.rotation.copy(container.rotation)
    fallback.updateMatrixWorld(true)

    // Frame against the active sequence, not the legacy container's bind pose.
    // A fixed-sequence preview may deliberately skip decoding that bind pose.
    const unpositionedBounds = new THREE.Box3().setFromObject(fallback)
    fallback.position.y = (unpositionedBounds.min.y - unpositionedBounds.max.y) / 2
    fallback.updateMatrixWorld(true)

    const renderedBounds = new THREE.Box3().setFromObject(fallback)
    fallback.userData.modelBounds = {
      min: renderedBounds.min.toArray(),
      max: renderedBounds.max.toArray()
    }

    return fallback
  }, [animationIndex, container, meshesRenderData, modelData, textures])

  const fallbackAnimationTime = React.useRef(0)
  React.useEffect(() => {
    fallbackAnimationTime.current = 0
  }, [animationIndex])

  const usesFixedSequenceFallback = props.animation !== undefined

  // Updating scene objects
  React.useEffect(() => {
    if (scene) {
      if (!usesFixedSequenceFallback) {
        scene.add(container)
      }
      scene.add(fallbackContainer)
      scene.add(...lights)

      return () => {
        if (!usesFixedSequenceFallback) {
          scene.remove(container)
        }
        scene.remove(fallbackContainer)
        scene.remove(...lights)
      }
    }
  }, [container, fallbackContainer, scene, lights, usesFixedSequenceFallback])

  // Update model data
  React.useEffect(() => props.setModelData(modelData), [modelData])

  // Update controller
  React.useEffect(() => props.setModelController(controller), [controller])

  // GoldSrc models have widely varying coordinate systems and scale. Frame the
  // actual geometry instead of relying on a fixed camera distance.
  React.useEffect(() => {
    const framedObject = usesFixedSequenceFallback ? fallbackContainer : container
    framedObject.updateMatrixWorld(true)

    const savedBounds = framedObject.userData.modelBounds as
      { min: number[]; max: number[] } | undefined
    const bounds = savedBounds
      ? new THREE.Box3(
          new THREE.Vector3(savedBounds.min[0], savedBounds.min[1], savedBounds.min[2]),
          new THREE.Vector3(savedBounds.max[0], savedBounds.max[1], savedBounds.max[2])
        )
      : new THREE.Box3().setFromObject(framedObject)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const radius = size.length() / 2

    if (!Number.isFinite(radius) || radius <= 0) {
      console.warn('[HLMV] Cannot frame model: geometry bounds are empty', {
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
        size: size.toArray()
      })
      return
    }

    if (props.camera?.fov !== undefined) {
      camera.fov = props.camera.fov
    }

    const fieldOfViewRadians = THREE.Math.degToRad(camera.fov)
    const distance =
      (radius / Math.tan(fieldOfViewRadians / 2)) * (props.camera?.distanceMultiplier ?? 1.35)

    camera.near = props.camera?.near ?? Math.max(distance / 1_000, 0.01)
    camera.far = props.camera?.far ?? Math.max(distance * 10, 1_000)

    const target = props.camera?.target ? new THREE.Vector3(...props.camera.target) : center
    const direction = props.camera?.direction
      ? new THREE.Vector3(...props.camera.direction).normalize()
      : new THREE.Vector3(0, 0, 1)
    const position = props.camera?.position
      ? new THREE.Vector3(...props.camera.position)
      : center.clone().add(direction.multiplyScalar(distance))

    camera.position.copy(position)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    orbitDistance.current = camera.position.distanceTo(target)

    if (orbitControls) {
      orbitControls.target.copy(target)
      orbitControls.update()
      if (props.orbitAngleLimit !== undefined) {
        const initialAzimuth = orbitControls.getAzimuthalAngle()
        orbitControls.minAzimuthAngle = Math.max(-Math.PI, initialAzimuth - props.orbitAngleLimit)
        orbitControls.maxAzimuthAngle = Math.min(Math.PI, initialAzimuth + props.orbitAngleLimit)
      }
    }

    console.info('[HLMV] Model framed in camera', {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      center: center.toArray(),
      target: target.toArray(),
      size: size.toArray(),
      radius: Math.round(radius * 100) / 100,
      distance: Math.round(distance * 100) / 100,
      cameraPosition: camera.position.toArray()
    })
  }, [
    camera,
    container,
    fallbackContainer,
    orbitControls,
    props.camera,
    props.orbitAngleLimit,
    usesFixedSequenceFallback
  ])

  // Updating animation frame
  useAnimationFrame(() => {
    const startedAt = performance.now()
    const canRender =
      !props.maxFrameRate ||
      props.maxFrameRate <= 0 ||
      startedAt - lastRenderAt.current >= 1000 / props.maxFrameRate

    if (orbitControls) {
      orbitControls.update()
      if (props.lockCameraDistance && orbitDistance.current) {
        const offset = camera.position.clone().sub(orbitControls.target)
        if (offset.lengthSq() > 0) {
          camera.position.copy(
            orbitControls.target.clone().add(offset.setLength(orbitDistance.current))
          )
        }
      }
    }

    const delta = timer.getDelta()
    if (!usesFixedSequenceFallback) {
      controller.update(delta)
    }

    // The fallback uses regular BufferGeometry instead of the legacy morph
    // material pipeline. Advance its precomputed GoldSrc animation frames here.
    const activeSequence = modelData.sequences[animationIndex]
    if (activeSequence?.numFrames > 0 && activeSequence.fps > 0) {
      fallbackAnimationTime.current += delta
      if (canRender) {
        const frame =
          Math.floor(fallbackAnimationTime.current * activeSequence.fps) % activeSequence.numFrames

        fallbackContainer.children.forEach((child) => {
          const mesh = child as THREE.Mesh
          const frames = mesh.userData.geometryBuffers?.[animationIndex] as
            THREE.BufferAttribute[] | undefined
          const sourcePosition = frames?.[frame]
          const position = (mesh.geometry as THREE.BufferGeometry).getAttribute(
            'position'
          ) as THREE.BufferAttribute

          if (sourcePosition && position) {
            position.array.set(sourcePosition.array)
            position.needsUpdate = true
          }
        })
      }
    }

    if (renderer && canRender) {
      lastRenderAt.current = startedAt
      renderer.render(scene, camera)

      if (!hasRenderedFirstFrame.current) {
        hasRenderedFirstFrame.current = true
        console.info('[HLMV] First WebGL frame rendered', {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          points: renderer.info.render.points,
          lines: renderer.info.render.lines
        })
      }
    }

    const frameMilliseconds = performance.now() - startedAt
    const now = performance.now()
    if (frameMilliseconds > 32 && now - lastSlowFrameLogAt.current > 2000) {
      lastSlowFrameLogAt.current = now
      console.warn('[HLMV] Slow render frame', {
        milliseconds: Math.round(frameMilliseconds),
        hasRenderer: Boolean(renderer),
        hasOrbitControls: Boolean(orbitControls)
      })
    }
  })

  return (
    <div ref={setViewport} className={props.className}>
      <WindowSizeSensor
        target={viewport}
        onChange={(size) => {
          camera.aspect = size.width / size.height
          camera.updateProjectionMatrix()

          if (renderer) {
            renderer.setSize(size.width, size.height)
          }
        }}
      >
        {(state) => (
          <canvas
            ref={canvasRef}
            style={{
              width: state.width + 'px',
              height: state.height + 'px'
            }}
          />
        )}
      </WindowSizeSensor>
    </div>
  )
}
