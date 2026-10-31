const MAX_MODEL_CACHE_BYTES = 64 * 1024 * 1024
const PREVIEW_MODEL_CACHE_ENABLED = true

const modelBuffers = new Map<string, ArrayBuffer>()
const pendingModels = new Map<string, Promise<ArrayBuffer>>()
let cachedBytes = 0
let cacheGeneration = 0

export const clearCachedSkinModels = (): void => {
  cacheGeneration += 1
  modelBuffers.clear()
  pendingModels.clear()
  cachedBytes = 0
}

const cacheModel = (key: string, buffer: ArrayBuffer): void => {
  if (buffer.byteLength > MAX_MODEL_CACHE_BYTES) return

  const previous = modelBuffers.get(key)
  if (previous) cachedBytes -= previous.byteLength

  modelBuffers.delete(key)
  modelBuffers.set(key, buffer)
  cachedBytes += buffer.byteLength

  while (cachedBytes > MAX_MODEL_CACHE_BYTES && modelBuffers.size > 1) {
    const oldest = modelBuffers.entries().next().value as [string, ArrayBuffer] | undefined
    if (!oldest) break
    modelBuffers.delete(oldest[0])
    cachedBytes -= oldest[1].byteLength
  }
}

export const getCachedSkinModel = (
  skinId: string,
  revision = '',
  kind: 'player' | 'view' = 'player'
): Promise<ArrayBuffer> => {
  if (!PREVIEW_MODEL_CACHE_ENABLED) return window.api.skins.previewModel(skinId, kind)

  const key = JSON.stringify([skinId, revision, kind])
  const cached = modelBuffers.get(key)
  if (cached) {
    // Refresh insertion order so the bounded cache evicts the least recently
    // used model first.
    modelBuffers.delete(key)
    modelBuffers.set(key, cached)
    return Promise.resolve(cached)
  }

  const pending = pendingModels.get(key)
  if (pending) return pending

  const requestGeneration = cacheGeneration
  const request = window.api.skins
    .previewModel(skinId, kind)
    .then((buffer) => {
      if (requestGeneration === cacheGeneration) cacheModel(key, buffer)
      return buffer
    })
    .finally(() => {
      if (pendingModels.get(key) === request) pendingModels.delete(key)
    })

  pendingModels.set(key, request)
  return request
}
