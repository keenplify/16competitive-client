import { parseStickerRecipes } from '../../shared/sticker-recipes'

/** Artwork only. Entitlements and the session manifest are revalidated at launch. */
export async function matchStickerArtwork(
  api: URL,
  matchId: string,
  token: string,
  signal: AbortSignal
): Promise<string[]> {
  const response = await fetch(new URL(`/matches/${encodeURIComponent(matchId)}/stickers`, api), {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
  })
  if (response.status === 404) return []
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > 128 * 1024)
    throw new Error('STICKER_RESPONSE_INVALID')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.length
      if (size > 128 * 1024) throw new Error('STICKER_RESPONSE_INVALID')
      chunks.push(item.value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const recipes = parseStickerRecipes(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  return [
    ...new Set(recipes.flatMap((recipe) => recipe.stickers.map((sticker) => sticker.imagePath)))
  ]
}
