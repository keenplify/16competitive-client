import { vec3, quat, mat4 } from 'gl-matrix'
import * as structs from '../const/structs'
import { ANIM_VALUE, MOTION_X, MOTION_Z } from '../const/constants'
import { ModelData } from './modelDataParser'
import { MultiArrayView } from './multiArrayView'

/**
 * Converts Euler angles into a quaternion
 */
export function anglesToQuaternion(angles: vec3): quat {
  const pitch = angles[0]
  const roll = angles[1]
  const yaw = angles[2]

  // FIXME: rescale the inputs to 1/2 angle
  const cy = Math.cos(yaw * 0.5)
  const sy = Math.sin(yaw * 0.5)
  const cp = Math.cos(roll * 0.5)
  const sp = Math.sin(roll * 0.5)
  const cr = Math.cos(pitch * 0.5)
  const sr = Math.sin(pitch * 0.5)

  return quat.fromValues(
    sr * cp * cy - cr * sp * sy, // X
    cr * sp * cy + sr * cp * sy, // Y
    cr * cp * sy - sr * sp * cy, // Z
    cr * cp * cy + sr * sp * sy // W
  )
}

/**
 * Calculates bone angle
 */
export const calcBoneQuaternion = (
  frame: number,
  bone: structs.Bone,
  animOffset: Uint16Array,
  animValues: MultiArrayView<number>,
  sequenceIndex: number,
  boneIndex: number,
  s: number
): quat => {
  const angle1: vec3 = vec3.create()
  const angle2: vec3 = vec3.create()

  for (let axis = 0; axis < 3; axis++) {
    if (animOffset[axis + 3] == 0) {
      angle2[axis] = angle1[axis] = bone.value[axis + 3] // default;
    } else {
      const getTotal = (index: number) =>
        animValues.get(sequenceIndex, boneIndex, axis + 3, index, ANIM_VALUE.TOTAL)
      const getValue = (index: number) =>
        animValues.get(sequenceIndex, boneIndex, axis + 3, index, ANIM_VALUE.VALUE)
      const getValid = (index: number) =>
        animValues.get(sequenceIndex, boneIndex, axis + 3, index, ANIM_VALUE.VALID)

      let i = 0
      let k = frame

      while (getTotal(i) <= k) {
        k -= getTotal(i)
        i += getValid(i) + 1
      }

      // Bah, missing blend!
      if (getValid(i) > k) {
        angle1[axis] = getValue(i + k + 1)

        if (getValid(i) > k + 1) {
          angle2[axis] = getValue(i + k + 2)
        } else {
          if (getTotal(i) > k + 1) {
            angle2[axis] = angle1[axis]
          } else {
            angle2[axis] = getValue(i + getValid(i) + 2)
          }
        }
      } else {
        angle1[axis] = getValue(i + getValid(i))

        if (getTotal(i) > k + 1) {
          angle2[axis] = angle1[axis]
        } else {
          angle2[axis] = getValue(i + getValid(i) + 2)
        }
      }

      angle1[axis] = bone.value[axis + 3] + angle1[axis] * bone.scale[axis + 3]
      angle2[axis] = bone.value[axis + 3] + angle2[axis] * bone.scale[axis + 3]
    }
  }

  if (vec3.equals(angle1, angle2)) {
    return anglesToQuaternion(angle1)
  }

  const q1 = anglesToQuaternion(angle1)
  const q2 = anglesToQuaternion(angle2)

  return quat.slerp(quat.create(), q1, q2, s)
}

/**
 * Returns bone positions
 */
export const getBonePositions = (
  frame: number,
  bone: structs.Bone,
  animOffset: Uint16Array,
  animValues: MultiArrayView<number>,
  sequenceIndex: number,
  boneIndex: number,
  s: number
): vec3 => {
  void s
  const position: vec3 = vec3.create()
  for (let axis = 0; axis < 3; axis++) {
    position[axis] = bone.value[axis]
    if (!animOffset[axis]) continue
    let run = 0
    let remaining = Math.floor(frame)
    // GoldSrc run-length encoding: one header followed by valid signed samples.
    for (let guard = 0; guard < 512; guard++) {
      const total = animValues.get(sequenceIndex, boneIndex, axis, run, ANIM_VALUE.TOTAL)
      const valid = animValues.get(sequenceIndex, boneIndex, axis, run, ANIM_VALUE.VALID)
      if (total <= 0 || valid <= 0 || valid > total) break
      if (remaining < total) {
        const sample = animValues.get(
          sequenceIndex,
          boneIndex,
          axis,
          run + Math.min(remaining + 1, valid),
          ANIM_VALUE.VALUE
        )
        position[axis] += sample * bone.scale[axis]
        break
      }
      remaining -= total
      run += valid + 1
    }
  }

  return position
}

/**
 * Calculates bone transforms
 */
export const calcBoneTransforms = (
  quaternions: quat[],
  positions: vec3[],
  bones: structs.Bone[]
): mat4[] => {
  const boneTransforms: mat4[] = []

  for (let i = 0; i < bones.length; i++) {
    const boneMatrix = mat4.fromQuat(mat4.create(), quaternions[i])

    for (let j = 0; j < 3; j++) {
      // 4 — vector size, 3 + j — index in quat
      boneMatrix[4 * 3 + j] = positions[i][j]
    }

    if (bones[i].parent === -1) {
      // Root bone
      boneTransforms.push(boneMatrix)
    } else {
      boneTransforms.push(mat4.multiply(mat4.create(), boneTransforms[bones[i].parent], boneMatrix))
    }
  }

  return boneTransforms
}

export const calcRotations = (
  modelData: ModelData,
  sequenceIndex: number,
  frame: number,
  // TODO: Do something about it
  s = 0
): mat4[] => {
  const boneQuaternions: quat[] = modelData.bones.map((_, boneIndex): quat =>
    calcBoneQuaternion(
      frame,
      modelData.bones[boneIndex],
      modelData.animations[sequenceIndex][boneIndex].offset,
      modelData.animValues,
      sequenceIndex,
      boneIndex,
      s
    )
  )

  const bonesPositions: vec3[] = modelData.bones.map((_, boneIndex): vec3 =>
    getBonePositions(
      frame,
      modelData.bones[boneIndex],
      modelData.animations[sequenceIndex][boneIndex].offset,
      modelData.animValues,
      sequenceIndex,
      boneIndex,
      s
    )
  )

  for (const axis of [MOTION_X, MOTION_X, MOTION_Z]) {
    if (modelData.sequences[sequenceIndex].motionType & axis) {
      bonesPositions[modelData.sequences[sequenceIndex].motionBone][1] = 0
    }
  }

  return calcBoneTransforms(boneQuaternions, bonesPositions, modelData.bones)
}
