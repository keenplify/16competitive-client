/* eslint-disable react-hooks/exhaustive-deps */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck bad types

import * as React from 'react'
import { ModelData, parseModel } from '../lib/modelDataParser'
import { buildTexture } from '../lib/textureBuilder'
import { prepareRenderData, createModelMeshes, createContainer } from '../lib/modelRenderer'
import { createModelController, ModelController } from '../lib/modelController'
import {
  createOrbitControls,
  createRenderer,
  createCamera,
  createLights,
  createTimer,
  createScene
} from '../lib/screneRenderer'
import * as THREE from 'three'

export type WindowSize = {
  width: number
  height: number
}

type WindowSizeSensorProps = {
  onChange?: (size: WindowSize) => void
  children: (state: WindowSize) => React.ReactNode
}

export const WindowSizeSensor = ({
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
      const newSize = {
        width: window.innerWidth,
        height: window.innerHeight
      }

      setSize(newSize)

      if (onChangeRef.current) {
        onChangeRef.current(newSize)
      }
    }

    // Call it once on mount to ensure the Three.js renderer and camera
    // get correctly sized before the user resizes the window for the first time.
    handleResize()

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

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
}

export const Renderer = (props: Props): React.JSX.Element => {
  // Canvas reference
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null)

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
    if (!canvas) {
      return null
    }

    return createOrbitControls(camera, canvas)
  }, [camera, canvas])

  // Scene lights
  // Note: you can pass lights color to arguments
  const lights = React.useMemo(() => createLights(), [])

  // Parsing the model buffer
  const modelData: ModelData = React.useMemo(() => {
    const startedAt = performance.now()
    console.info('[HLMV] Parsing model', { bytes: props.modelBuffer.byteLength })
    const parsedModel = parseModel(props.modelBuffer)
    console.info('[HLMV] Model parsed', {
      milliseconds: Math.round(performance.now() - startedAt),
      sequences: parsedModel.sequences.length,
      textures: parsedModel.textures.length,
      meshes: parsedModel.meshes.flat(2).length
    })
    return parsedModel
  }, [props.modelBuffer])

  // Meshes render
  const meshesRenderData = React.useMemo(() => {
    const startedAt = performance.now()
    console.info('[HLMV] Preparing render data')
    const preparedRenderData = prepareRenderData(modelData)
    console.info('[HLMV] Render data prepared', {
      milliseconds: Math.round(performance.now() - startedAt)
    })
    return preparedRenderData
  }, [modelData])

  // Textures preparing
  const textures = React.useMemo(() => {
    const startedAt = performance.now()
    const preparedTextures = modelData.textures.map((texture) =>
      buildTexture(props.modelBuffer, texture)
    )
    console.info('[HLMV] Textures prepared', {
      milliseconds: Math.round(performance.now() - startedAt),
      textures: preparedTextures.length
    })
    return preparedTextures
  }, [modelData, props.modelBuffer])

  // Generation meshes
  const meshes = React.useMemo(() => {
    console.info('[HLMV] Creating model meshes')
    const createdMeshes = createModelMeshes(meshesRenderData, modelData, textures)
    console.info('[HLMV] Model meshes created')
    return createdMeshes
  }, [meshesRenderData, modelData, textures])

  // Creating model controller
  const controller: ModelController = React.useMemo(() => {
    console.info('[HLMV] Creating model controller')
    const createdController = createModelController(meshes, meshesRenderData, modelData)
    console.info('[HLMV] Model controller created')
    return createdController
  }, [meshes, meshesRenderData, modelData])

  // Mesh container
  const container = React.useMemo(() => createContainer(meshes), [meshes])

  // Updating scene objects
  React.useEffect(() => {
    if (scene) {
      scene.add(container)
      scene.add(...lights)

      return () => {
        scene.remove(container)
        scene.remove(...lights)
      }
    }
  }, [container, scene, lights])

  // Update model data
  React.useEffect(() => props.setModelData(modelData), [modelData])

  // Update controller
  React.useEffect(() => props.setModelController(controller), [controller])

  // Updating animation frame
  useAnimationFrame(() => {
    if (orbitControls) {
      orbitControls.update()
    }

    timer.update()
    const delta = timer.getDelta()
    controller.update(delta)

    if (renderer) {
      renderer.render(scene, camera)
    }
  })

  return (
    <WindowSizeSensor
      onChange={(size) => {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()

        if (renderer) {
          renderer.setSize(size.width, size.height)
        }
      }}
    >
      {(state) => (
        <canvas
          ref={setCanvas}
          style={{
            width: state.width + 'px',
            height: state.height + 'px'
          }}
        />
      )}
    </WindowSizeSensor>
  )
}
