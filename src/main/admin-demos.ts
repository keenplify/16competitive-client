import { spawn } from 'node:child_process'
import { open, realpath, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import { getSavedCs16Executable } from './game/game-settings'
import { resolveCs16LaunchTarget } from './game/cs16-installation'
import { getMatchmakingNodes } from './matchmaking-regions'
import { matchmakingConnection } from './matchmaking'
import type { AdminDemoList } from '../shared/admin-demos'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'
const token = (): string => {
  const value = getSessionToken()
  if (!value) throw new Error('Sign in first.')
  return value
}
async function request(path: string, bearer: string): Promise<Response> {
  return fetch(new URL(path, API_BASE_URL), {
    headers: { authorization: `Bearer ${bearer}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  })
}
export async function listAdminDemos(page: unknown): Promise<AdminDemoList | null> {
  if (!Number.isInteger(page) || Number(page) < 1 || Number(page) > 100000)
    throw new Error('Invalid page')
  const response = await request(`/admin/anti-cheat/recordings?page=${page}`, token())
  if (response.status === 403) return null
  if (!response.ok) throw new Error(`Could not load admin demos (${response.status}).`)
  const data: unknown = await response.json()
  if (
    !object(data) ||
    typeof data.hasMore !== 'boolean' ||
    !Array.isArray(data.recordings) ||
    data.recordings.length > 25 ||
    !data.recordings.every(
      (row) =>
        object(row) &&
        typeof row.id === 'string' &&
        uuid.test(row.id) &&
        typeof row.matchId === 'string' &&
        uuid.test(row.matchId) &&
        typeof row.username === 'string' &&
        typeof row.status === 'string' &&
        typeof row.requestedAt === 'string' &&
        (row.sizeBytes === null || typeof row.sizeBytes === 'number')
    )
  )
    throw new Error('Invalid demo list response')
  return data as unknown as AdminDemoList
}
let watching = false
export async function watchAdminDemo(id: unknown): Promise<void> {
  if (typeof id !== 'string' || !uuid.test(id)) throw new Error('Invalid recording ID')
  if (watching) throw new Error('A demo is already being prepared.')
  const ensureIdle = (): void => {
    if (matchmakingConnection.isBusyForDemo())
      throw new Error('Leave matchmaking and finish your current match before watching a demo.')
  }
  ensureIdle()
  watching = true
  let temporary: string | undefined
  try {
    const bearer = token()
    const checkPermission = async (): Promise<void> => {
      const permission = await request('/admin/anti-cheat/demo-playback-permission', bearer)
      if (!permission.ok)
        throw new Error(
          permission.status === 409
            ? 'Leave matchmaking and finish your match before watching a demo.'
            : 'Administrator playback permission could not be verified.'
        )
    }
    await checkPermission()
    const response = await request(`/admin/anti-cheat/recordings/${id}/download`, bearer)
    if (!response.ok) throw new Error(`Demo access denied or unavailable (${response.status}).`)
    const info: unknown = await response.json()
    if (!object(info) || info.status !== 'READY' || typeof info.downloadUrl !== 'string')
      throw new Error('This recording is not ready.')
    const url = new URL(info.downloadUrl)
    const origins = new Set([
      new URL(API_BASE_URL).origin,
      ...(await getMatchmakingNodes()).map((node) => new URL(node.publicApiUrl).origin)
    ])
    if (
      !origins.has(url.origin) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== `/admin/anti-cheat/recordings/${id}/file` ||
      (url.protocol !== 'https:' && url.origin !== new URL(API_BASE_URL).origin)
    )
      throw new Error('Untrusted recording download location')
    const configured = await getSavedCs16Executable()
    if (!configured) throw new Error('Choose your Counter-Strike installation in Settings first.')
    const executable = await realpath(configured)
    const target = await resolveCs16LaunchTarget(executable)
    const gameDirectory = await realpath(join(dirname(target.gameExecutable), 'cstrike'))
    const name = `16c_review_${id}_${randomUUID().slice(0, 8)}`
    const destination = join(gameDirectory, `${name}.dem`)
    temporary = `${destination}.part`
    const download = await fetch(url, {
      headers: { authorization: `Bearer ${bearer}` },
      redirect: 'error',
      signal: AbortSignal.timeout(180000)
    })
    if (!download.ok || !download.body)
      throw new Error(`Demo download failed (${download.status}).`)
    const limit = 512 * 1024 * 1024
    if (Number(download.headers.get('content-length')) > limit) {
      await download.body.cancel()
      throw new Error('Demo exceeds the 512 MB limit.')
    }
    const file = await open(temporary, 'wx', 0o600)
    let size = 0
    try {
      for await (const chunk of download.body) {
        size += chunk.length
        if (size > limit) throw new Error('Demo exceeds the 512 MB limit.')
        let offset = 0
        while (offset < chunk.length) {
          const result = await file.write(chunk, offset, chunk.length - offset)
          if (!result.bytesWritten) throw new Error('Could not write demo')
          offset += result.bytesWritten
        }
      }
    } finally {
      await file.close()
    }
    const check = await open(temporary, 'r')
    try {
      const header = Buffer.alloc(8)
      await check.read(header, 0, 8, 0)
      if (size < 544 || header.toString('ascii') !== 'HLDEMO\0\0')
        throw new Error('Downloaded file is not a GoldSrc demo.')
    } finally {
      await check.close()
    }
    ensureIdle()
    if (getSessionToken() !== bearer) throw new Error('Session changed; open the demo again.')
    await checkPermission()
    ensureIdle()
    await rename(temporary, destination)
    temporary = undefined
    ensureIdle()
    await new Promise<void>((resolve, reject) => {
      const child = spawn(target.executable, [...target.argumentPrefix, '+viewdemo', name], {
        cwd: dirname(target.gameExecutable),
        shell: false,
        detached: true,
        stdio: 'ignore'
      })
      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })
  } finally {
    watching = false
    if (temporary) await rm(temporary, { force: true })
  }
}
