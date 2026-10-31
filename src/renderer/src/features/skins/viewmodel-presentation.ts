import type { ModelData } from '../../libs/web-hlmv/lib/modelDataParser'
import { calcRotations } from '../../libs/web-hlmv/lib/geometryTransformer'
import { readFacesData } from '../../libs/web-hlmv/lib/geometryBuilder'
import { applyBoneTransforms } from '../../libs/web-hlmv/lib/modelRenderer'

/** Custom conversions can already be right-handed. Mirror only when the weapon is on the left. */
export function viewmodelNeedsMirror(model: ModelData, idle: number, weapon: string): boolean {
  const transforms = calcRotations(model, idle, 0, 0, true)
  const namedWeapon = model.textures.some((texture) => texture.name.toLowerCase().includes(weapon))
  let offset = 0
  let samples = 0
  model.meshes.forEach((parts, body) =>
    parts.forEach((meshes, part) =>
      meshes.forEach((mesh, meshIndex) => {
        const texture = model.textures[model.skinRef[mesh.skinRef]]
        if (!texture || /^(?:view_)?(?:glove|finger|skin|hands?|sleeve)/i.test(texture.name)) return
        if (namedWeapon && !texture.name.toLowerCase().includes(weapon)) return
        const faces = readFacesData(
          model.triangles[body][part][meshIndex],
          model.vertices[body][part],
          texture
        )
        const vertices = applyBoneTransforms(
          faces.vertices,
          faces.indices,
          model.vertBoneBuffer[body][part],
          transforms
        )
        for (let i = 0; i < vertices.length; i += 3) {
          const forward = vertices[i]
          const sideways = vertices[i + 1]
          if (forward > 0.5 && Number.isFinite(sideways) && Math.abs(sideways / forward) < 10) {
            offset += sideways / forward
            samples++
          }
        }
      })
    )
  )
  return samples === 0 || Math.abs(offset / samples) < 0.03 ? true : offset > 0
}
