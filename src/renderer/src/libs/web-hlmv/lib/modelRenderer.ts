import { filterPreviewHandHelpers } from './preview-hand-helpers'
import THREE from './three'
import { mat4 } from 'gl-matrix'
import { ModelData } from './modelDataParser'
import { readFacesData } from './geometryBuilder'
import { calcRotations } from './geometryTransformer'
import { NF_ADDITIVE, NF_CHROME } from '../const/constants'

/** GoldSrc additive textures otherwise wash out against WebGL's bright preview background. */
const ADDITIVE_OPACITY = 0.8

/**
 * Mesh buffers of each frame of each sequence of the model and mesh UV-maps
 */
export type MeshRenderData = {
  geometryBuffers: THREE.BufferAttribute[][]
  uvMap: THREE.BufferAttribute
  normalBuffers?: THREE.BufferAttribute[][]
}

/**
 * Creates THREE.Texture instance with presets
 */
export const createTexture = (
  skinBuffer: Uint8ClampedArray,
  width: number,
  height: number
): THREE.Texture => {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    skinBuffer.byteLength !== width * height * 4
  ) {
    throw new Error('Invalid preview RGBA texture')
  }
  // Upload explicit RGBA bytes rather than treating ImageData as a canvas.
  // Array-buffer uploads do not apply UNPACK_FLIP_Y_WEBGL, so reverse rows
  // here to preserve the existing GoldSrc UV orientation across GL drivers.
  const pixels = new Uint8Array(skinBuffer.byteLength)
  const stride = width * 4
  for (let row = 0; row < height; row++) {
    pixels.set(skinBuffer.subarray(row * stride, (row + 1) * stride), (height - row - 1) * stride)
  }
  const texture = new THREE.DataTexture(
    pixels,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
    THREE.UVMapping,
    THREE.ClampToEdgeWrapping,
    THREE.ClampToEdgeWrapping,
    THREE.LinearFilter,
    THREE.LinearFilter
  )
  texture.flipY = false
  texture.generateMipmaps = false
  texture.unpackAlignment = 1
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
  // Validate each bone once, rather than allocating an array for every vertex.
  const validTransforms = boneTransforms.map(
    (transform) => transform && Array.from(transform).every(Number.isFinite)
  )
  for (let i = 0; i < vertIndices.length; i++) {
    const transform: mat4 = boneTransforms[vertBoneBuffer[vertIndices[i]]]
    const x = vertices[i * 3 + 0]
    const y = vertices[i * 3 + 1]
    const z = vertices[i * 3 + 2]

    // Some otherwise valid GoldSrc models reference animation data that is not
    // present in the selected MDL. Keep the bind-pose vertex visible instead
    // of feeding NaN values to Three.js, which makes the entire bounding box
    // (and therefore the model) disappear.
    if (!validTransforms[vertBoneBuffer[vertIndices[i]]]) {
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

/** Normals follow bone rotation only; bone translation must not affect chrome UVs. */
export const applyBoneNormals = (
  normals: Float32Array,
  indices: Int16Array,
  bindings: Uint8Array,
  transforms: mat4[]
): Float32Array => {
  const result = new Float32Array(normals.length)
  for (let i = 0; i < indices.length; i++) {
    const x = normals[i * 3],
      y = normals[i * 3 + 1],
      z = normals[i * 3 + 2]
    const transform = transforms[bindings[indices[i]]]
    let nx = x,
      ny = y,
      nz = z
    if (transform) {
      nx = transform[0] * x + transform[4] * y + transform[8] * z
      ny = transform[1] * x + transform[5] * y + transform[9] * z
      nz = transform[2] * x + transform[6] * y + transform[10] * z
    }
    const length = Math.hypot(nx, ny, nz)
    if (Number.isFinite(length) && length > 0) {
      result.set([nx / length, ny / length, nz / length], i * 3)
    } else result.set([0, 0, 1], i * 3)
  }
  return result
}

/** Rotates every calculated bone around the model's root-bone origin. */
export const applyRootBoneRotation = (
  boneTransforms: mat4[],
  rotation?: readonly [number, number, number]
): mat4[] => {
  if (!rotation || boneTransforms.length === 0) return boneTransforms

  const inverseRoot = mat4.invert(mat4.create(), boneTransforms[0])
  if (!inverseRoot) return boneTransforms

  const correction = mat4.create()
  mat4.rotateX(correction, correction, (rotation[0] * Math.PI) / 180)
  mat4.rotateY(correction, correction, (rotation[1] * Math.PI) / 180)
  mat4.rotateZ(correction, correction, (rotation[2] * Math.PI) / 180)
  const pivotRotation = mat4.multiply(mat4.create(), boneTransforms[0], correction)
  mat4.multiply(pivotRotation, pivotRotation, inverseRoot)

  return boneTransforms.map((transform) => mat4.multiply(mat4.create(), pivotRotation, transform))
}

/**
 * Returns generated mesh buffers and UV-maps of each frame of each sequence of
 * the model
 * @param modelData Model data
 */
export const prepareRenderData = (
  modelData: ModelData,
  sequenceIndices?: readonly number[],
  rootBoneRotation?: readonly [number, number, number],
  calculateBoneTransforms: typeof calcRotations = calcRotations,
  hideHandHelpers = false
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
          applyRootBoneRotation(
            calculateBoneTransforms(modelData, sequenceIndex, frame),
            rootBoneRotation
          )
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
        const decodedFaces = readFacesData(
          triangles,
          sourceVertices,
          texture ?? {
            width: 1,
            height: 1
          }
        )

        const { vertices, uv, indices } = hideHandHelpers
          ? filterPreviewHandHelpers(
              decodedFaces,
              modelData.vertBoneBuffer[bodyPartIndex][subModelIndex],
              modelData.bones
            )
          : decodedFaces

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

        const sourceNormals = modelData.normals?.[bodyPartIndex]?.[subModelIndex]
        const normalBindings = modelData.normBoneBuffer?.[bodyPartIndex]?.[subModelIndex]
        const chromeFaces =
          texture?.flags & NF_CHROME &&
          sourceNormals &&
          normalBindings &&
          vertices.length === decodedFaces.vertices.length
            ? readFacesData(triangles, sourceNormals, texture, 1)
            : undefined
        const normalBuffers =
          chromeFaces && normalBindings
            ? boneTransforms.map((frames) =>
                frames.length
                  ? frames.map(
                      (transforms) =>
                        new THREE.BufferAttribute(
                          applyBoneNormals(
                            chromeFaces.vertices,
                            chromeFaces.indices,
                            normalBindings,
                            transforms
                          ),
                          3
                        )
                    )
                  : [new THREE.BufferAttribute(chromeFaces.vertices, 3)]
              )
            : undefined

        renderData[bodyPartIndex][subModelIndex].push({
          normalBuffers,
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
export const createModelMaterial = (texture?: THREE.Texture, textureFlags = 0) => {
  const additive = (textureFlags & NF_ADDITIVE) !== 0
  const material = new THREE.MeshBasicMaterial({
    ...(texture ? { map: texture } : {}),
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.5,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    opacity: additive ? ADDITIVE_OPACITY : 1,
    // Additive surfaces must not hide geometry rendered after them.
    depthWrite: !additive,
    morphTargets: true,
    skinning: true
  }) as THREE.MeshBasicMaterial & {
    onBeforeCompile: (shader: { vertexShader: string }) => void
  }
  if ((textureFlags & NF_CHROME) !== 0) {
    // GoldSrc chrome ignores stored S/T coordinates and samples a 64x64
    // texture with the rotated surface normal in the viewer's right/up basis.
    // MeshBasicMaterial preserves the fullbright appearance without baked lighting.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  vec3 chromeViewNormal = normalize(normalMatrix * normal);
  vUv = vec2(0.5 + chromeViewNormal.x * 0.5, 0.5 + chromeViewNormal.y * 0.5);
#endif`
      )
    }
  }
  return material
}

export const createMesh = (
  geometryBuffer: THREE.BufferAttribute,
  uvMap: THREE.BufferAttribute,
  texture?: THREE.Texture,
  textureFlags = 0,
  normalBuffer?: THREE.BufferAttribute
) => {
  // Mesh level
  const material = createModelMaterial(texture, textureFlags)

  // Prepare geometry
  const geometry = new THREE.BufferGeometry()
  geometry.addAttribute('position', geometryBuffer)
  geometry.addAttribute('uv', uvMap)
  if (normalBuffer) geometry.addAttribute('normal', normalBuffer)
  else if ((textureFlags & NF_CHROME) !== 0) geometry.computeVertexNormals()

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
    return createTexture(
      textureBuffer,
      modelData.textures[textureIndex].width,
      modelData.textures[textureIndex].height
    )
  })

  const modelMeshes: THREE.Mesh[][][] = meshesRenderData.map((bodyPart, bodyPartIndex) =>
    // Body part level
    bodyPart.map((subModel, subModelIndex) =>
      // Sub model level
      subModel.map(({ geometryBuffers, uvMap, normalBuffers }, meshIndex) => {
        const initialGeometryBuffer = geometryBuffers[0][0]
        const textureIndex =
          modelData.skinRef[modelData.meshes[bodyPartIndex][subModelIndex][meshIndex].skinRef]
        const texture = textures[textureIndex]

        return createMesh(
          initialGeometryBuffer,
          uvMap,
          texture,
          modelData.textures[textureIndex]?.flags,
          normalBuffers?.[0]?.[0]
        )
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
  presentationRotation?: readonly [number, number, number],
  preserveOrigin = false
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
  container.position.y = preserveOrigin ? 0 : (boundingBox.min.y - boundingBox.max.y) / 2

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
