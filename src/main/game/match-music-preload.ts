import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, rename, rm, writeFile } from 'node:fs/promises'

const LIMIT = 24 * 1024 * 1024
type MusicAsset = { path: string; sha256: string }

export function matchMusicAssets(value: unknown): MusicAsset[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 4096) throw new Error('MUSIC_MANIFEST_INVALID')
  const paths = new Set<string>()
  return value
    .map((entry: unknown): MusicAsset => {
      const asset = entry as MusicAsset | null
      const pathHash =
        typeof asset?.path === 'string'
          ? /^sound\/16competitive\/music\/([a-f0-9]{32})\/audio\.(?:mp3|wav)$/.exec(
              asset.path
            )?.[1]
          : null
      if (
        !pathHash ||
        typeof asset?.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(asset.sha256) ||
        !asset.sha256.startsWith(pathHash) ||
        paths.has(asset.path)
      )
        throw new Error('MUSIC_MANIFEST_INVALID')
      paths.add(asset.path)
      return { path: asset.path, sha256: asset.sha256 }
    })
    .filter((asset) => asset.path.endsWith('.mp3')) // WAV cues use the required-asset pipeline.
}

async function verified(path: string, expected: string): Promise<boolean> {
  const metadata = await lstat(path).catch(() => null)
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size < 16 ||
    metadata.size > LIMIT
  )
    return false
  const file = await open(path, 'r')
  try {
    const digest = createHash('sha256')
    const buffer = Buffer.alloc(64 * 1024)
    let size = 0
    while (size <= LIMIT) {
      const { bytesRead } = await file.read(
        buffer,
        0,
        Math.min(buffer.length, LIMIT + 1 - size),
        null
      )
      if (!bytesRead) return size >= 16 && digest.digest('hex') === expected
      size += bytesRead
      digest.update(buffer.subarray(0, bytesRead))
    }
    return false
  } finally {
    await file.close()
  }
}

/** Only the backend-selected match MP3s; no catalog-wide audio download. */
export async function preloadMatchMusic(
  asset: MusicAsset,
  destination: (path: string) => Promise<string>,
  api: URL,
  matchId: string,
  token: string,
  signal: AbortSignal
): Promise<void> {
  const selected = matchMusicAssets([asset])[0]
  if (!selected) throw new Error('MUSIC_MANIFEST_INVALID')
  signal.throwIfAborted()
  const path = await destination(selected.path)
  if (await verified(path, selected.sha256)) return
  const url = new URL(`/matches/${encodeURIComponent(matchId)}/assets/file`, api)
  url.searchParams.set('path', selected.path)
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)])
  })
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > LIMIT)
    throw new Error('MUSIC_DOWNLOAD_FAILED')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const item = await reader.read()
      if (item.done) break
      size += item.value.length
      if (size > LIMIT) throw new Error('MUSIC_DOWNLOAD_TOO_LARGE')
      chunks.push(item.value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks)
  if (size < 16 || createHash('sha256').update(bytes).digest('hex') !== selected.sha256)
    throw new Error('MUSIC_HASH_MISMATCH')
  const temporary = `${path}.${randomUUID()}.partial`
  try {
    signal.throwIfAborted()
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
    signal.throwIfAborted()
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
