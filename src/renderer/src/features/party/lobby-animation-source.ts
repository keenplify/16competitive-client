import { lobbySequenceLabelFor } from './character-animation'

interface AnimationModel {
  bones: readonly { name: string; parent: number }[]
  sequences: readonly { label: string }[]
}

/** Match by names and hierarchy: custom MDLs may reorder bones or use another rig. */
export const lobbyAnimationSource = (
  player: AnimationModel,
  donor: AnimationModel,
  weaponKey: string
): { sequenceIndex: number; boneIndices: number[] } | null => {
  const sequenceIndex = donor.sequences.findIndex(
    ({ label }) => label.toLowerCase() === lobbySequenceLabelFor(weaponKey)
  )
  if (sequenceIndex < 0 || player.bones.length === 0) return null
  const byName = new Map(donor.bones.map((bone, index) => [bone.name.toLowerCase(), index]))
  if (byName.size !== donor.bones.length) return null
  const boneIndices = player.bones.map((bone) => byName.get(bone.name.toLowerCase()) ?? -1)
  if (new Set(player.bones.map((bone) => bone.name.toLowerCase())).size !== player.bones.length)
    return null
  if (boneIndices.some((index) => index < 0)) return null
  for (const [index, bone] of player.bones.entries()) {
    const parent = bone.parent < 0 ? -1 : boneIndices[bone.parent]
    if (parent === undefined || donor.bones[boneIndices[index]].parent !== parent) return null
  }
  return { sequenceIndex, boneIndices }
}
