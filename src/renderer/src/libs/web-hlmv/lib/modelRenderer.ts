import THREE from './three'
import { mat4 } from 'gl-matrix'
import { ModelData } from './modelDataParser'
import { readFacesData } from './geometryBuilder'
import { calcRotations } from './geometryTransformer'

/**
 * Mesh buffers of each frame of each sequence of the model and mesh UV-maps
 */
export type MeshRenderData = {
  geometryBuffers: THREE.BufferAttribute[][]
  uvMap: THREE.BufferAttribute
}

/**
 * Creates THREE.Texture instance with presets
 */
export const createTexture = (
  skinBuffer: Uint8ClampedArray,
  width: number,
  height: number
): THREE.Texture => {
  const imageData = new ImageData(skinBuffer as Uint8ClampedArray<ArrayBuffer>, width, height)

  const texture = new THREE.Texture(
    imageData as unknown as HTMLCanvasElement,
    THREE.UVMapping,
    THREE.ClampToEdgeWrapping,
    THREE.ClampToEdgeWrapping,
    THREE.LinearFilter,
    THREE.LinearFilter,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  )

  texture.needsUpdate = true

  return texture
}

/**
 * Applies bone transforms to a position array and returns it
 */
export const applyBoneTransforms = (
  vertices: Float32Array,
  vertIndices: Int16Array,
  vertBoneBuffer: Uint8Array,
  boneTransforms: mat4[]
): Float32Array => {
  const posArray = new Float32Array(vertices.length)
  for (let i = 0; i < vertIndices.length; i++) {
    const transform: mat4 = boneTransforms[vertBoneBuffer[vertIndices[i]]]
    const x = vertices[i * 3 + 0]
    const y = vertices[i * 3 + 1]
    const z = vertices[i * 3 + 2]

    // Some otherwise valid GoldSrc models reference animation data that is not
    // present in the selected MDL. Keep the bind-pose vertex visible instead
    // of feeding NaN values to Three.js, which makes the entire bounding box
    // (and therefore the model) disappear.
    if (!transform || Array.from(transform).some((value) => !Number.isFinite(value))) {
      posArray[i * 3 + 0] = x
      posArray[i * 3 + 1] = y
      posArray[i * 3 + 2] = z
      continue
    }

    // The vec3.transformMat4 function was removed from here, because its use
    // (creation of an additional vector) increased the code performance by
    // 4 times. Instead, it uses manual multiplication.

    const w = transform[3] * x + transform[7] * y + transform[11] * z + transform[15] || 1.0

    const transformedX =
      (transform[0] * x + transform[4] * y + transform[8] * z + transform[12]) / w
    const transformedY =
      (transform[1] * x + transform[5] * y + transform[9] * z + transform[13]) / w
    const transformedZ =
      (transform[2] * x + transform[6] * y + transform[10] * z + transform[14]) / w

    if (
      !Number.isFinite(transformedX) ||
      !Number.isFinite(transformedY) ||
      !Number.isFinite(transformedZ)
    ) {
      posArray[i * 3 + 0] = x
      posArray[i * 3 + 1] = y
      posArray[i * 3 + 2] = z
      continue
    }

    posArray[i * 3 + 0] = transformedX
    posArray[i * 3 + 1] = transformedY
    posArray[i * 3 + 2] = transformedZ
  }

  return posArray
}

/**
 * Returns generated mesh buffers and UV-maps of each frame of each sequence of
 * the model
 * @param modelData Model data
 */
export const prepareRenderData = (
  modelData: ModelData,
  sequenceIndices?: readonly number[]
): MeshRenderData[][][] => {
  const startedAt = performance.now()
  const renderData: MeshRenderData[][][] = []
  const selectedSequences = sequenceIndices ? new Set(sequenceIndices) : undefined
  const totalFrames = modelData.sequences.reduce(
    (sum, sequence, index) =>
      sum + (!selectedSequences || selectedSequences.has(index) ? sequence.numFrames : 0),
    0
  )
  const totalMeshes = modelData.meshes.reduce(
    (count, bodyPart) =>
      count + bodyPart.reduce((subModelCount, subModel) => subModelCount + subModel.length, 0),
    0
  )
  const expectedGeometryBuffers = totalFrames * totalMeshes

  console.info('[HLMV] Building animation bone transforms', {
    sequences: modelData.sequences.length,
    totalFrames,
    bodyParts: modelData.bodyParts.length,
    meshes: totalMeshes,
    expectedGeometryBuffers
  })
  const boneTransforms = modelData.sequences.map((sequence, sequenceIndex) =>
    selectedSequences && !selectedSequences.has(sequenceIndex)
      ? []
      : Array.from({ length: sequence.numFrames }, (_, frame) =>
          calcRotations(modelData, sequenceIndex, frame)
        )
  )
  const invalidBoneTransforms = boneTransforms
    .flat(2)
    .filter((transform) => Array.from(transform).some((value) => !Number.isFinite(value))).length

  if (invalidBoneTransforms > 0) {
    console.warn('[HLMV] Invalid animation transforms; using bind pose for affected vertices', {
      invalidBoneTransforms,
      totalBoneTransforms: boneTransforms.flat(2).length
    })
  }
  console.info('[HLMV] Animation bone transforms built', {
    milliseconds: Math.round(performance.now() - startedAt)
  })

  let builtMeshes = 0
  let lastProgressLogAt = performance.now()
  let meshesWithoutFaces = 0

  for (let bodyPartIndex = 0; bodyPartIndex < modelData.bodyParts.length; bodyPartIndex++) {
    renderData[bodyPartIndex] = []

    for (
      let subModelIndex = 0;
      subModelIndex < modelData.subModels[bodyPartIndex].length;
      subModelIndex++
    ) {
      renderData[bodyPartIndex][subModelIndex] = []

      for (
        let meshIndex = 0;
        meshIndex < modelData.meshes[bodyPartIndex][subModelIndex].length;
        meshIndex++
      ) {
        const meshStartedAt = performance.now()
        const sourceMesh = modelData.meshes[bodyPartIndex][subModelIndex][meshIndex]
        const triangles = modelData.triangles[bodyPartIndex][subModelIndex][meshIndex]
        const sourceVertices = modelData.vertices[bodyPartIndex][subModelIndex]
        const textureIndex = modelData.skinRef[sourceMesh.skinRef]
        const texture = modelData.textures[textureIndex]

        // Unpack faces of the mesh
        const { vertices, uv, indices } = readFacesData(
          triangles,
          sourceVertices,
          texture ?? {
            width: 1,
            height: 1
          }
        )

        if (vertices.length === 0) {
          meshesWithoutFaces += 1
          console.warn('[HLMV] Mesh has no decoded faces', {
            bodyPart: modelData.bodyParts[bodyPartIndex].name,
            subModel: modelData.subModels[bodyPartIndex][subModelIndex].name,
            meshIndex,
            declaredTriangles: sourceMesh.numTris,
            sourceVertices: sourceVertices.length / 3,
            triangleOffset: sourceMesh.triIndex,
            triangleDataStart: Array.from(triangles.slice(0, 12))
          })
        }

        renderData[bodyPartIndex][subModelIndex].push({
          // UV-map of the mesh
          uvMap: new THREE.BufferAttribute(uv, 2),

          // List of mesh buffer for each frame of each sequence
          geometryBuffers: modelData.sequences.map((sequence, sequenceIndex) => {
            // Keep a harmless bind-pose buffer for inactive sequences so the
            // legacy controller can still be constructed. Their expensive bone
            // transforms are not needed by a fixed-sequence preview.
            if (selectedSequences && !selectedSequences.has(sequenceIndex)) {
              return [new THREE.BufferAttribute(vertices, 3)]
            }

            const bufferAttributes: THREE.BufferAttribute[] = []

            for (let frame = 0; frame < sequence.numFrames; frame++) {
              const transformedVertices = applyBoneTransforms(
                vertices,
                indices,
                modelData.vertBoneBuffer[bodyPartIndex][subModelIndex],
                boneTransforms[sequenceIndex][frame]
              )

              bufferAttributes.push(new THREE.BufferAttribute(transformedVertices, 3))
            }

            return bufferAttributes
          })
        })

        builtMeshes += 1
        const now = performance.now()
        if (now - lastProgressLogAt >= 1000 || builtMeshes === totalMeshes) {
          console.info('[HLMV] Render-data build progress', {
            meshes: `${builtMeshes}/${totalMeshes}`,
            percent: totalMeshes === 0 ? 100 : Math.round((builtMeshes / totalMeshes) * 100),
            currentMeshMilliseconds: Math.round(now - meshStartedAt),
            elapsedMilliseconds: Math.round(now - startedAt)
          })
          lastProgressLogAt = now
        }
      }
    }
  }

  console.info('[HLMV] Geometry decode summary', {
    meshes: totalMeshes,
    meshesWithoutFaces
  })

  return renderData
}

/**
 * Creates model mesh
 */
export const createMesh = (
  geometryBuffer: THREE.BufferAttribute,
  uvMap: THREE.BufferAttribute,
  texture?: THREE.Texture
) => {
  // Mesh level
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.5,
    morphTargets: true,
    skinning: true
    // color:        0xffffff
  })

  // Prepare geometry
  const geometry = new THREE.BufferGeometry()
  geometry.addAttribute('position', geometryBuffer)
  geometry.addAttribute('uv', uvMap)

  // Prepare mesh
  return new THREE.Mesh(geometry, material)
}

/**
 * Creates list of meshes of every submodel
 */
export const createModelMeshes = (
  meshesRenderData: MeshRenderData[][][],
  modelData: ModelData,
  textureBuffers: Uint8ClampedArray[]
): THREE.Mesh[][][] => {
  const textures: THREE.Texture[] = textureBuffers.map((textureBuffer, textureIndex) => {
    const texture = new THREE.Texture(
      new ImageData(
        textureBuffer as Uint8ClampedArray<ArrayBuffer>,
        modelData.textures[textureIndex].width,
        modelData.textures[textureIndex].height
      ) as unknown as HTMLCanvasElement,
      THREE.UVMapping,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping,
      THREE.LinearFilter,
      THREE.LinearFilter,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    )

    texture.needsUpdate = true

    return texture
  })

  const modelMeshes: THREE.Mesh[][][] = meshesRenderData.map((bodyPart, bodyPartIndex) =>
    // Body part level
    bodyPart.map((subModel, subModelIndex) =>
      // Sub model level
      subModel.map(({ geometryBuffers, uvMap }, meshIndex) => {
        const initialGeometryBuffer = geometryBuffers[0][0]
        const textureIndex =
          modelData.skinRef[modelData.meshes[bodyPartIndex][subModelIndex][meshIndex].skinRef]
        const texture = textures[textureIndex]

        return createMesh(initialGeometryBuffer, uvMap, texture)
      })
    )
  )

  return modelMeshes
}

/**
 * Creates THREE.js object to render
 */
export const createContainer = (
  meshes: THREE.Mesh[][][],
  presentationRotation?: readonly [number, number, number]
) => {
  const container = new THREE.Group()

  // Adding meshes to the container
  meshes.forEach((bodyPart) =>
    // Body part level
    bodyPart.forEach((subModel) =>
      // Sub model level
      subModel.forEach((mesh) => {
        // Mesh level
        container.add(mesh)
      })
    )
  )

  // Sets to display the front of the model
  container.rotation.x = THREE.Math.degToRad(-90)
  container.rotation.z = THREE.Math.degToRad(-90)

  if (presentationRotation) {
    const [x, y, z] = presentationRotation.map((degrees) => THREE.Math.degToRad(degrees))
    container.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), x)
    container.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), y)
    container.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), z)
  }

  // Sets to display model on the center of camera
  const boundingBox = new THREE.Box3().setFromObject(container)
  container.position.y = (boundingBox.min.y - boundingBox.max.y) / 2

  // Preserve bounds from the same Three.js module that constructed the meshes.
  // This avoids relying on cross-module instanceof checks in the renderer.
  container.updateMatrixWorld(true)
  const renderedBounds = new THREE.Box3().setFromObject(container)
  container.userData.modelBounds = {
    min: renderedBounds.min.toArray(),
    max: renderedBounds.max.toArray()
  }

  return container
}
