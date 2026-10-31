export type SkinPreviewRotation = readonly [number, number, number]

/** Missing metadata is valid for older servers. Malformed offsets never reach WebGL. */
export const isSkinPreviewRotation = (value: unknown): value is SkinPreviewRotation =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every(
    (angle) => typeof angle === 'number' && Number.isFinite(angle) && angle >= -360 && angle <= 360
  )

export const skinPreviewRotation = (value: unknown): SkinPreviewRotation =>
  isSkinPreviewRotation(value) ? value : [0, 0, 0]
