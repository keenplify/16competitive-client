/** Missing metadata stays compatible with older APIs. These names never address files. */
export const isSkinPreviewHiddenTextures = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 64 &&
  value.every(
    (name) =>
      typeof name === 'string' &&
      name.trim().length > 0 &&
      name.length <= 64 &&
      Array.from(name).every((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127)
  )

export const skinPreviewHiddenTextures = (value: unknown): string[] =>
  isSkinPreviewHiddenTextures(value)
    ? [...new Set(value.map((name) => name.trim().toLowerCase()))].sort()
    : []

/** Compact cache identity, not a security hash. Keeps thumbnail keys below IPC limits. */
export const skinHiddenTexturesRevision = (value: unknown): string => {
  let hash = 0xcbf29ce484222325n
  for (const char of JSON.stringify(skinPreviewHiddenTextures(value))) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(char.charCodeAt(0))) * 0x100000001b3n)
  }
  return hash.toString(16)
}
