import { lobbyAnimationIndexFor } from './character-animation'
import { lobbyAnimationSource } from './lobby-animation-source'
import { parseModelCached } from '../../libs/web-hlmv/lib/modelDataParser'
import { buildTexture } from '../../libs/web-hlmv/lib/textureBuilder'
import { prepareRenderData } from '../../libs/web-hlmv/lib/modelRenderer'
import { readFacesData } from '../../libs/web-hlmv/lib/geometryBuilder'
import { calcRotations } from '../../libs/web-hlmv/lib/geometryTransformer'
import type { CachedLobbyPresentation } from './lobby-model-cache'

export const buildLobbyPresentation = (
  playerBuffer: ArrayBuffer,
  weaponKey: string,
  animationBuffer?: ArrayBuffer
): CachedLobbyPresentation => {
  const localPlayer = parseModelCached(playerBuffer)
  if (
    localPlayer.textures.length === 0 ||
    localPlayer.meshes
      .flat(2)
      .some((mesh) => !localPlayer.textures[localPlayer.skinRef[mesh.skinRef]])
  ) {
    throw new Error('Player preview requires embedded textures for every mesh')
  }
  const donor = animationBuffer ? parseModelCached(animationBuffer) : null
  const source = donor ? lobbyAnimationSource(localPlayer, donor, weaponKey) : null
  const player = source && donor ? { ...localPlayer, sequences: donor.sequences } : localPlayer
  const animationIndex = source?.sequenceIndex ?? lobbyAnimationIndexFor(player, weaponKey)
  // Keep geometry, skin references and textures from the actual selected MDL.
  // Both the mesh and held weapon must follow the same donor bone transforms.
  const rotations: typeof calcRotations =
    source && donor
      ? (_model, sequence, frame) => {
          const transforms = calcRotations(donor, sequence, frame)
          return source.boneIndices.map((index) => transforms[index])
        }
      : calcRotations
  const activeSequence = player.sequences[animationIndex]
  const renderData = prepareRenderData(player, [animationIndex], undefined, rotations)
  const boneNames = player.bones.map((bone) => bone.name.toLowerCase())
  const upperBodyRoot = boneNames.findIndex((boneName) => boneName === 'bip01 spine')
  const isUpperBodyBone = (boneIndex: number): boolean => {
    let current = boneIndex
    while (current >= 0) {
      if (current === upperBodyRoot) return true
      current = player.bones[current]?.parent ?? -1
    }
    return false
  }
  const boneTransforms = Array.from({ length: activeSequence?.numFrames ?? 0 }, (_, frame) =>
    rotations(player, animationIndex, frame).map((matrix) => new Float32Array(matrix))
  )
  const meshes = renderData.flatMap((bodyPart, bodyPartIndex) =>
    bodyPart.flatMap((subModel, subModelIndex) =>
      subModel.map(({ geometryBuffers, uvMap }, meshIndex) => {
        const sourceMesh = player.meshes[bodyPartIndex][subModelIndex][meshIndex]
        const textureIndex = player.skinRef[sourceMesh.skinRef]
        const texture = player.textures[textureIndex]
        const { indices } = readFacesData(
          player.triangles[bodyPartIndex][subModelIndex][meshIndex],
          player.vertices[bodyPartIndex][subModelIndex],
          texture ?? { width: 1, height: 1 }
        )
        const vertexBones = player.vertBoneBuffer[bodyPartIndex][subModelIndex]
        return {
          animationFrames: geometryBuffers[animationIndex].map(
            (frame) => new Float32Array(frame.array)
          ),
          upperBodyMask: Uint8Array.from(indices, (vertexIndex) =>
            isUpperBodyBone(vertexBones[vertexIndex]) ? 1 : 0
          ),
          uv: new Float32Array(uvMap.array),
          textureIndex
        }
      })
    )
  )

  return {
    fps: activeSequence?.fps ?? 0,
    frameCount: activeSequence?.numFrames ?? 0,
    boneNames,
    boneTransforms,
    upperBodyPivots: boneTransforms.map((frame) => {
      const transform = frame[upperBodyRoot]
      return transform
        ? new Float32Array([transform[12], transform[13], transform[14]])
        : new Float32Array([0, 0, 0])
    }),
    meshes,
    textures: player.textures.map((texture) => ({
      pixels: buildTexture(playerBuffer, texture),
      width: texture.width,
      height: texture.height
    }))
  }
}
