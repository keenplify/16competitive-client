type Faces = { vertices: Float32Array; uv: Float32Array; indices: Int16Array }
type Bone = { name: string }
const isHand = (name: string): boolean =>
  /^(?:bip\d+\s+)?(?:r|l|right|left)\s+hand$/i.test(name.trim())

/** Remove only closed hand-bone cuboids mixed with actual weapon geometry.
 * Materials may be shared with visible details, so texture names are irrelevant.
 * Called during standalone preview preparation; never edits the source MDL.
 */
export function filterPreviewHandHelpers(
  faces: Faces,
  boneIndices: Uint8Array,
  bones: readonly Bone[]
): Faces {
  const handTriangles = new Map<number, number[]>()
  let hasWeaponGeometry = false
  for (let i = 0; i < faces.indices.length; i += 3) {
    const a = boneIndices[faces.indices[i]],
      b = boneIndices[faces.indices[i + 1]],
      c = boneIndices[faces.indices[i + 2]]
    if (a === b && a === c && isHand(bones[a]?.name ?? '')) {
      const triangles = handTriangles.get(a) ?? []
      triangles.push(i)
      handTriangles.set(a, triangles)
    } else if ([a, b, c].some((bone) => bones[bone] && !isHand(bones[bone].name)))
      hasWeaponGeometry = true
  }
  // A held object can legitimately be a box. Preserve it when there is no
  // separate weapon geometry in this mesh.
  if (!hasWeaponGeometry) return faces
  const hidden = new Set<number>()
  for (const triangles of handTriangles.values()) {
    if (triangles.length !== 12) continue
    const points = new Map<number, number[]>()
    const edges = new Map<string, number>()
    for (const triangle of triangles) {
      for (let corner = 0; corner < 3; corner++) {
        const index = triangle + corner,
          vertex = faces.indices[index]
        points.set(vertex, Array.from(faces.vertices.subarray(index * 3, index * 3 + 3)))
        const next = faces.indices[triangle + ((corner + 1) % 3)]
        const edge = vertex < next ? `${vertex}:${next}` : `${next}:${vertex}`
        edges.set(edge, (edges.get(edge) ?? 0) + 1)
      }
    }
    if (points.size !== 8 || edges.size !== 18 || [...edges.values()].some((count) => count !== 2))
      continue
    const coordinates = [...points.values()]
    const minimum = [0, 1, 2].map((axis) => Math.min(...coordinates.map((p) => p[axis])))
    const maximum = [0, 1, 2].map((axis) => Math.max(...coordinates.map((p) => p[axis])))
    if (maximum.some((value, axis) => value - minimum[axis] < 0.001)) continue
    const corners = new Set<number>()
    for (const point of coordinates) {
      let mask = 0,
        valid = true
      for (let axis = 0; axis < 3; axis++) {
        const tolerance = Math.max(0.02, (maximum[axis] - minimum[axis]) * 0.01)
        if (Math.abs(point[axis] - minimum[axis]) <= tolerance) continue
        if (Math.abs(point[axis] - maximum[axis]) <= tolerance) mask |= 1 << axis
        else valid = false
      }
      if (valid) corners.add(mask)
    }
    if (corners.size === 8) triangles.forEach((triangle) => hidden.add(triangle))
  }
  if (!hidden.size) return faces
  const count = faces.indices.length - hidden.size * 3
  const vertices = new Float32Array(count * 3),
    uv = new Float32Array(count * 2),
    indices = new Int16Array(count)
  let output = 0
  for (let triangle = 0; triangle < faces.indices.length; triangle += 3) {
    if (hidden.has(triangle)) continue
    vertices.set(faces.vertices.subarray(triangle * 3, (triangle + 3) * 3), output * 3)
    uv.set(faces.uv.subarray(triangle * 2, (triangle + 3) * 2), output * 2)
    indices.set(faces.indices.subarray(triangle, triangle + 3), output)
    output += 3
  }
  return { vertices, uv, indices }
}
