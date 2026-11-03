import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { validateSteamProtonRuntime, type SteamProtonRuntime } from './steam-proton'

const contextPath = (userData: string, root: string): string =>
  join(userData, 'proton-recovery', `${createHash('sha256').update(root).digest('hex')}.json`)

export async function saveProtonRecoveryContext(
  userData: string,
  root: string,
  sessionId: string,
  runtime: SteamProtonRuntime
): Promise<void> {
  if (!validateSteamProtonRuntime(runtime)) throw new Error('Invalid Steam Proton recovery context')
  const path = contextPath(userData, root)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify({ root, sessionId, runtime }), {
      mode: 0o600,
      flag: 'wx'
    })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function readProtonRecoveryContext(
  userData: string,
  root: string,
  sessionId: string
): Promise<SteamProtonRuntime | undefined> {
  const path = contextPath(userData, root)
  const entry = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!entry) return undefined
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 16384)
    throw new Error('Invalid Steam Proton recovery context')
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!value || typeof value !== 'object') throw new Error('Invalid Steam Proton recovery context')
  const record = value as Record<string, unknown>
  if (
    record.root !== root ||
    record.sessionId !== sessionId ||
    !validateSteamProtonRuntime(record.runtime)
  )
    throw new Error('Steam Proton recovery context does not match this session')
  return record.runtime
}

export async function removeProtonRecoveryContext(userData: string, root: string): Promise<void> {
  await rm(contextPath(userData, root), { force: true })
}
