type TexturedModel = {
  meshes: { skinRef: number }[][][]
  skinRef: ArrayLike<number>
  textures: { name: string }[]
}

/** Omit whole effect meshes before camera bounds are computed, without modifying MDL bytes. */
export const previewMeshVisible = (
  model: TexturedModel,
  body: number,
  submodel: number,
  mesh: number,
  hiddenTextures: ReadonlySet<string>
): boolean => {
  const reference = model.meshes[body][submodel][mesh].skinRef
  const name = model.textures[model.skinRef[reference]]?.name.trim().toLowerCase()
  return !name || !hiddenTextures.has(name)
}
