import { createHash } from 'node:crypto'
import { STOCK_STICKER_MODELS, stockStickerModelPath } from '../shared/stock-sticker-models'
import { getSessionToken } from './auth'
import { resolvePreferredMatchmakingApiUrl } from './matchmaking-regions'

const sources = new Map(
  Object.entries(STOCK_STICKER_MODELS).map(([key, model]) => [
    stockStickerModelPath(key),
    model.sha256
  ])
)
const cache = new Map<string, ArrayBuffer>()

/** Only exact pinned stock source keys are accepted; never fetch arbitrary renderer paths. */
export async function readStockStickerSource(path: string): Promise<ArrayBuffer | null> {
  const expected = sources.get(path)
  if (!expected) return null
  const token = getSessionToken()
  if (!token) throw new Error('UNAUTHORIZED')
  const cached = cache.get(path)
  if (cached) return cached.slice(0)
  const url = new URL('/skins/assets/file', await resolvePreferredMatchmakingApiUrl())
  url.searchParams.set('path', path)
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok || !response.body) throw new Error('STICKER_MODEL_UNAVAILABLE')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 16 * 1024 * 1024) throw new Error('STICKER_MODEL_UNSUPPORTED')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks)
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('STICKER_MODEL_UNSUPPORTED')
  const result = new Uint8Array(bytes).buffer
  cache.set(path, result)
  return result.slice(0)
}
