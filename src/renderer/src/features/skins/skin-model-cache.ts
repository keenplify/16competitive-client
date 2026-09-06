const MAX_MODEL_CACHE_BYTES = 64 * 1024 * 1024
// Temporarily disabled while preview rendering is being tuned. Re-enable once
// model orientation and loading behavior are confirmed.
const PREVIEW_MODEL_CACHE_ENABLED = true

const modelBuffers = new Map<string, ArrayBuffer>()
const pendingModels = new Map<string, Promise<ArrayBuffer>>()
let cachedBytes = 0

const cacheModel = (skinId: string, buffer: ArrayBuffer): void => {
  if (buffer.byteLength > MAX_MODEL_CACHE_BYTES) return

  const previous = modelBuffers.get(skinId)
  if (previous) cachedBytes -= previous.byteLength

  modelBuffers.delete(skinId)
  modelBuffers.set(skinId, buffer)
  cachedBytes += buffer.byteLength

  while (cachedBytes > MAX_MODEL_CACHE_BYTES && modelBuffers.size > 1) {
    const oldest = modelBuffers.entries().next().value as [string, ArrayBuffer] | undefined
    if (!oldest) break
    modelBuffers.delete(oldest[0])
    cachedBytes -= oldest[1].byteLength
  }
}

export const getCachedSkinModel = (skinId: string): Promise<ArrayBuffer> => {
  if (!PREVIEW_MODEL_CACHE_ENABLED) return window.api.skins.previewModel(skinId)

  const cached = modelBuffers.get(skinId)
  if (cached) {
    // Refresh insertion order so the bounded cache evicts the least recently
    // used model first.
    modelBuffers.delete(skinId)
    modelBuffers.set(skinId, cached)
    return Promise.resolve(cached)
  }

  const pending = pendingModels.get(skinId)
  if (pending) return pending

  const request = window.api.skins
    .previewModel(skinId)
    .then((buffer) => {
      cacheModel(skinId, buffer)
      return buffer
    })
    .finally(() => pendingModels.delete(skinId))

  pendingModels.set(skinId, request)
  return request
}
