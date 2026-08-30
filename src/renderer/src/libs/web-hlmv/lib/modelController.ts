import THREE from './three'
import * as R from 'ramda'
import { ModelData } from './modelDataParser'
import { MeshRenderData } from './modelRenderer'

// Use Omit to completely remove the untyped properties before replacing them,
// ensuring TypeScript doesn't get confused by overlapping `unknown[]` types.
type StrictModelData = Omit<ModelData, 'sequences' | 'bodyParts'> & {
  sequences: {
    label: string
    fps: number
    numFrames: number
  }[]
  bodyParts: unknown[]
}

/**
 * Calculates frame index by animation time, fps and frames number
 */
const getCurrentFrame = (time: number, fps: number, numFrames: number): number =>
  Math.floor((time % (numFrames / fps)) / (1 / fps))

/**
 * Returns the mesh's animation clips
 */
export const prepareAnimationClips = (
  meshData: MeshRenderData,
  modelData: ModelData
): THREE.AnimationClip[] => {
  const data = modelData as unknown as StrictModelData

  return meshData.geometryBuffers.map((sequenceBuffers, i) => {
    // Sequence level
    const sequence = data.sequences[i]
    const isNoLoop = false

    // Safely cast vertices to bypass Three.js strict Vector3[] expectation for TypedArrays
    const frameBuffers = sequenceBuffers.map((bufferAttribute, index) => ({
      name: index.toString(),
      vertices: bufferAttribute.array as unknown as THREE.Vector3[]
    }))

    return THREE.AnimationClip.CreateFromMorphTargetSequence(
      sequence.label,
      frameBuffers as unknown as THREE.MorphTarget[],
      sequence.fps,
      isNoLoop
    )
  })
}

/**
 * Creates mesh controller
 */
export const createMeshController = (
  mesh: THREE.Mesh,
  meshRenderData: MeshRenderData,
  modelData: ModelData,
  isDefaultVisible: boolean = false
) => {
  // Set default visibility of the mesh
  mesh.visible = isDefaultVisible

  let activeAction: THREE.AnimationAction | undefined
  let previousAction: THREE.AnimationAction | undefined

  const initialMorphTargets = meshRenderData.geometryBuffers[0]
  const geometry = mesh.geometry as THREE.BufferGeometry
  geometry.morphAttributes.position = initialMorphTargets
  const initialMorphTargetDictionary: Record<string, number> = {}
  initialMorphTargets.forEach((_, index) => {
    initialMorphTargetDictionary[String(index)] = index
  })
  mesh.morphTargetDictionary = initialMorphTargetDictionary
  mesh.morphTargetInfluences = initialMorphTargets.map(() => 0)

  const animationClips: THREE.AnimationClip[] = prepareAnimationClips(meshRenderData, modelData)
  const mixer = new THREE.AnimationMixer(mesh)

  const actions = animationClips.map((actionClip) => mixer.clipAction(actionClip, mesh))

  const meshModelController = {
    /** Return pause state of the mesh */
    get isPaused(): boolean {
      if (activeAction) {
        return activeAction.paused
      }

      return false
    },

    /**
     * Sets playback rate (animation speed)
     * @param rate
     */
    setPlaybackRate: (rate: number): void => {
      mixer.timeScale = rate !== 0 ? 1 / rate : 0
    },

    /**
     * Sets visibility of the mesh
     */
    setVisibility: (isVisible: boolean): void => {
      mesh.visible = isVisible
    },

    /**
     * Updates delta tile
     */
    update: (deltaTime: number): void => {
      mixer.update(deltaTime)
    },

    /**
     * Sets animation to play
     */
    setAnimation: (sequenceIndex: number): void => {
      const wasPaused = activeAction ? activeAction.paused : false

      previousAction = activeAction
      activeAction = actions[sequenceIndex]

      if (previousAction) {
        previousAction.stop()
      }

      // Update mesh morph targets
      const geometry = mesh.geometry as THREE.BufferGeometry
      const morphTargets = meshRenderData.geometryBuffers[sequenceIndex]
      geometry.morphAttributes.position = morphTargets
      const morphTargetDictionary: Record<string, number> = {}
      morphTargets.forEach((_, index) => {
        morphTargetDictionary[String(index)] = index
      })
      mesh.morphTargetDictionary = morphTargetDictionary
      mesh.morphTargetInfluences = morphTargets.map(() => 0)

      if (!activeAction) {
        throw new RangeError(`Animation sequence ${sequenceIndex} does not exist`)
      }

      activeAction.reset().play()
      activeAction.paused = wasPaused
    },

    /**
     * Set pause state of the running animation
     */
    setPause: (isPaused: boolean): void => {
      if (activeAction) {
        activeAction.paused = isPaused
      }
    },

    /**
     * Jump to specific time of the running animation
     */
    setTime: (time: number): void => {
      if (activeAction) {
        activeAction.time = time
      }
    },

    /**
     * Returns current time of the running animation
     */
    getCurrentTime: (): number => (activeAction ? activeAction.time : 0)
  }

  return meshModelController
}

/**
 * The model state
 */
export type ModelState = {
  isPaused: boolean
  activeAnimationIndex: number
  showedSubModels: number[]
  frame: number
  playbackRate: number
}

/**
 * Creates model controller.
 * @todo refactor this shit
 */
export const createModelController = (
  meshes: THREE.Mesh[][][],
  meshesRenderData: MeshRenderData[][][],
  modelData: ModelData,
  initialSequence: number = 0
) => {
  const data = modelData as unknown as StrictModelData

  let playbackRate = 1
  let isAnimationPaused = false

  // Active sequence
  let activeSequenceIndex: number = initialSequence

  // List of showed sub models indices
  const showedSubModels: number[] = data.bodyParts.map(() => 0)

  // Path: [bodyPartIndex][subModelIndex][meshIndex][sequenceIndex]
  const meshControllers = meshes.map((bodyPart, bodyPartIndex) =>
    bodyPart.map((subModel, subModelIndex) =>
      subModel.map((mesh, meshIndex) =>
        createMeshController(
          mesh,
          meshesRenderData[bodyPartIndex][subModelIndex][meshIndex],
          modelData,
          subModelIndex === 0
        )
      )
    )
  )

  // Setting default animation
  meshControllers.forEach((bodyPart) =>
    bodyPart.forEach((subModel) =>
      subModel.forEach((controller) => controller.setAnimation(activeSequenceIndex))
    )
  )

  const getAnimationTime = (): number =>
    R.converge(R.divide, [R.sum, R.length])(
      meshControllers.reduce(
        (acc, bodyPart) =>
          acc.concat(
            bodyPart.reduce(
              (acc, subModel) =>
                acc.concat(subModel.map((controller) => controller.getCurrentTime())),
              [] as number[]
            )
          ),
        [] as number[]
      )
    ) as number

  const areSubModelsPaused = (): boolean =>
    meshControllers.reduce(
      (acc, bodyPart) =>
        acc &&
        bodyPart.reduce(
          (acc, subModel) =>
            acc && subModel.reduce((acc, controller) => acc && controller.isPaused, true),
          true
        ),
      true
    )

  /** Returns current state of the model */
  const getCurrentState = (): ModelState => ({
    isPaused: areSubModelsPaused(),
    activeAnimationIndex: activeSequenceIndex,
    showedSubModels,
    frame: getCurrentFrame(
      getAnimationTime(),
      data.sequences[activeSequenceIndex].fps,
      data.sequences[activeSequenceIndex].numFrames
    ),
    playbackRate
  })

  const modelController = {
    /**
     * Updates delta time
     * @param deltaTime
     */
    update: (deltaTime: number) =>
      meshControllers.forEach((bodyPart) =>
        bodyPart.forEach((subModel) =>
          subModel.forEach((controller) => {
            controller.update(deltaTime)
          })
        )
      ),

    /** Returns current state of the model */
    getCurrentState,

    /** Set pause state of the model */
    setPause: (isPaused: boolean): ModelState => {
      isAnimationPaused = isPaused

      meshControllers.forEach((bodyPart) =>
        bodyPart.forEach((subModel) =>
          subModel.forEach((controller) => controller.setPause(isAnimationPaused))
        )
      )

      return getCurrentState()
    },

    /**
     * Sets playback rate (animation speed)
     * @param rate
     */
    setPlaybackRate: (rate: number): ModelState => {
      playbackRate = rate

      meshControllers.forEach((bodyPart) =>
        bodyPart.forEach((subModel) =>
          subModel.forEach((controller) => controller.setPlaybackRate(playbackRate))
        )
      )

      return getCurrentState()
    },

    /**
     * Sets animation to play
     * @param sequenceIndex
     */
    setAnimation: (sequenceIndex: number): ModelState => {
      activeSequenceIndex = sequenceIndex

      meshControllers.forEach((bodyPart) =>
        bodyPart.forEach((subModel) =>
          subModel.forEach((controller) => controller.setAnimation(sequenceIndex))
        )
      )

      return getCurrentState()
    },

    /**
     * Shows specified sub model
     */
    showSubModel: (bodyPartIndex: number, subModelIndex: number): ModelState => {
      showedSubModels[bodyPartIndex] = subModelIndex

      meshControllers[bodyPartIndex].forEach((subModel, i) => {
        const isVisible = i === subModelIndex

        subModel.forEach((controller) => {
          controller.setVisibility(isVisible)
        })
      })

      return getCurrentState()
    },

    /**
     * Sets specific frame of the running animations
     */
    setFrame: (frame: number): ModelState => {
      const { numFrames, fps } = data.sequences[activeSequenceIndex]
      const safeFrame = R.clamp(0, numFrames, frame)
      const duration = numFrames / fps
      const specifiedTime = (duration / numFrames) * safeFrame

      meshControllers.forEach((bodyPart) =>
        bodyPart.forEach((subModel) =>
          subModel.forEach((controller) => controller.setTime(specifiedTime))
        )
      )

      return getCurrentState()
    }
  }

  return modelController
}

export type ModelController = ReturnType<typeof createModelController>
