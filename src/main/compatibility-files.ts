import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, realpath } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import type { CompatibilityPreview } from '../shared/diagnostic-logs'

const windowsPaths = [
  'cstrike/cl_dlls/client.dll',
  'client_original.dll',
  'hw.dll',
  'valve/cl_dlls/GameUI.dll',
  'cstrike/cl_dlls/GameUI.dll',
  'vgui2.dll',
  'steam.dll'
]
const linuxPaths = ['cstrike/cl_dlls/client.so', 'hw.so', 'valve/cl_dlls/GameUI.so', 'vgui2.so']
const legacyWindowsPaths = [
  'cstrike/cl_dlls/client.dll',
  'cstrk13/cl_dlls/client.dll',
  'client_original.dll',
  'hw.dll',
  'sw.dll',
  'vgui.dll',
  'filesystem_stdio.dll'
]
const legacyLinuxPaths = [
  'cstrike/cl_dlls/client.so',
  'cstrk13/cl_dlls/client.so',
  'hw.so',
  'sw.so'
]
const LIMIT = 16 * 1024 * 1024
type Captured = {
  preview: CompatibilityPreview
  owner: string
  expires: number
  bytes: Map<string, Buffer>
}
let captured: Captured | undefined
let preparing = false

export async function collectCompatibilityFiles(
  root: string,
  platform: string,
  game: 'cs16' | 'cs13' = 'cs16'
) {
  const base = await realpath(root)
  const files: CompatibilityPreview['files'] = []
  const bytes = new Map<string, Buffer>()
  let totalBytes = 0
  const windows = game === 'cs13' ? legacyWindowsPaths : windowsPaths
  const linux = game === 'cs13' ? legacyLinuxPaths : linuxPaths
  for (const path of platform === 'win32' ? windows : platform === 'linux' ? linux : []) {
    const candidate = join(base, path)
    try {
      const info = await lstat(candidate)
      if (!info.isFile() || info.isSymbolicLink() || info.size < 64 || info.size > LIMIT) continue
      const resolved = await realpath(candidate)
      const rel = relative(base, resolved)
      if (rel.startsWith('..') || isAbsolute(rel) || resolved !== candidate) continue
      const handle = await open(resolved, 'r')
      try {
        const stat = await handle.stat()
        if (
          !stat.isFile() ||
          stat.size !== info.size ||
          stat.ino !== info.ino ||
          stat.dev !== info.dev
        )
          continue
        if (totalBytes + stat.size > 64 * 1024 * 1024) throw new Error('COMPATIBILITY_TOO_LARGE')
        // A bounded read also handles a file growing while it is being captured.
        const data = Buffer.alloc(stat.size + 1)
        let length = 0
        while (length < data.length) {
          const read = await handle.read(data, length, data.length - length, length)
          if (!read.bytesRead) break
          length += read.bytesRead
        }
        if (length !== stat.size) throw new Error('COMPATIBILITY_FILE_CHANGED')
        const content = data.subarray(0, length)
        const sha256 = createHash('sha256').update(content).digest('hex')
        files.push({ path, sha256, size: length })
        bytes.set(sha256, content)
        totalBytes += length
      } finally {
        await handle.close()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
  }
  return { files, bytes, totalBytes }
}

export async function prepareCompatibilityFiles(
  root: string,
  owner: string,
  game: 'cs16' | 'cs13' = 'cs16',
  platform: string = process.platform
): Promise<CompatibilityPreview> {
  if (preparing) throw new Error('COMPATIBILITY_BUSY')
  preparing = true
  captured = undefined
  try {
    const { files, bytes, totalBytes } = await collectCompatibilityFiles(root, platform, game)
    if (!files.length) throw new Error('COMPATIBILITY_FILES_UNAVAILABLE')
    const preview = { id: randomUUID(), files, totalBytes }
    captured = { preview, bytes, owner, expires: Date.now() + 10 * 60_000 }
    const id = preview.id
    setTimeout(() => {
      if (captured?.preview.id === id) captured = undefined
    }, 10 * 60_000).unref()
    return preview
  } finally {
    preparing = false
  }
}

export function getCompatibilityFiles(id: string, owner: string): Captured {
  if (
    !captured ||
    captured.preview.id !== id ||
    captured.owner !== owner ||
    captured.expires <= Date.now()
  ) {
    throw new Error('COMPATIBILITY_PREVIEW_EXPIRED')
  }
  return captured
}

export async function uploadCompatibilityFiles(
  api: string,
  token: string,
  reportId: string,
  value: Captured,
  stillOwner: () => boolean,
  request: typeof fetch = fetch
): Promise<void> {
  const base = `${api}/auth/issue-reports/${encodeURIComponent(reportId)}/compatibility`
  if (!stillOwner()) throw new Error('COMPATIBILITY_ACCOUNT_CHANGED')
  const response = await request(base, {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ files: value.preview.files }),
    signal: AbortSignal.timeout(45_000)
  })
  if (!response.ok) throw new Error('COMPATIBILITY_UPLOAD_FAILED')
  const result: unknown = await response.json()
  if (
    !result ||
    typeof result !== 'object' ||
    !('missing' in result) ||
    !Array.isArray(result.missing) ||
    result.missing.length > 7 ||
    result.missing.some((h) => typeof h !== 'string' || !value.bytes.has(h))
  ) {
    throw new Error('INVALID_COMPATIBILITY_RESPONSE')
  }
  for (const hash of new Set(result.missing as string[])) {
    if (!stillOwner()) throw new Error('COMPATIBILITY_ACCOUNT_CHANGED')
    const form = new FormData()
    form.set('file', new Blob([new Uint8Array(value.bytes.get(hash)!)]), `${hash}.bin`)
    const uploaded = await request(`${base}/${hash}`, {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(120_000)
    })
    if (!uploaded.ok) throw new Error('COMPATIBILITY_UPLOAD_FAILED')
  }
}
