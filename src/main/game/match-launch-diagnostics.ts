import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_RECORDS = 20
const MAX_BYTES = 4096
const MATCH_ID = /^[A-Za-z0-9_-]{1,80}$/

export interface MatchLaunchDiagnostics {
  matchId: string
  preparedAt: string
  clientVersion: string
  helperVersion: string
  platform: string
  endpoint: string
  tokenFingerprint: string
  handoff: 'native-nextclient' | 'userconfig'
  distribution: string
}

function recordPath(directory: string, matchId: string): string {
  if (!MATCH_ID.test(matchId)) throw new Error('Invalid diagnostic match ID')
  return join(directory, `match-${matchId}.json`)
}

// Project only known non-secret fields, including when reading a modified file.
// Never persist the connection payload: it also contains the password and token.
function parseRecord(value: unknown): MatchLaunchDiagnostics {
  if (!value || typeof value !== 'object') throw new Error('Invalid launch diagnostics')
  const record = value as Record<string, unknown>
  const fields = [
    'matchId',
    'preparedAt',
    'clientVersion',
    'helperVersion',
    'platform',
    'endpoint',
    'tokenFingerprint',
    'handoff',
    'distribution'
  ] as const
  for (const field of fields) {
    if (
      typeof record[field] !== 'string' ||
      record[field].length > 300 ||
      /[\r\n\0]/.test(record[field])
    ) {
      throw new Error('Invalid launch diagnostics')
    }
  }
  if (
    !MATCH_ID.test(record.matchId as string) ||
    !/^[a-f0-9]{12}$/.test(record.tokenFingerprint as string) ||
    !Number.isFinite(Date.parse(record.preparedAt as string)) ||
    !['native-nextclient', 'userconfig'].includes(record.handoff as string)
  )
    throw new Error('Invalid launch diagnostics')
  return Object.fromEntries(
    fields.map((field) => [field, record[field]])
  ) as unknown as MatchLaunchDiagnostics
}

export async function saveMatchLaunchDiagnostics(
  directory: string,
  value: MatchLaunchDiagnostics
): Promise<void> {
  const record = parseRecord(value)
  const destination = recordPath(directory, record.matchId)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(record), { flag: 'wx', mode: 0o600 })
    await rename(temporary, destination)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  const records = await Promise.all(
    (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^match-[A-Za-z0-9_-]{1,80}\.json$/.test(entry.name))
      .map(async (entry) => {
        const path = join(directory, entry.name)
        return { path, modified: (await lstat(path)).mtimeMs }
      })
  )
  records.sort((a, b) =>
    a.path === destination ? -1 : b.path === destination ? 1 : b.modified - a.modified
  )
  await Promise.all(records.slice(MAX_RECORDS).map(({ path }) => unlink(path)))
}

export async function readMatchLaunchDiagnostics(
  directory: string,
  matchId: string
): Promise<string> {
  const path = recordPath(directory, matchId)
  try {
    const entry = await lstat(path)
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Invalid launch diagnostics')
    const file = await open(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    )
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Invalid launch diagnostics')
      const bytes = Buffer.alloc(MAX_BYTES + 1)
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
      if (bytesRead > MAX_BYTES) throw new Error('Invalid launch diagnostics')
      const record = parseRecord(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')))
      if (record.matchId !== matchId) throw new Error('Mismatched launch diagnostics')
      return `[Saved match launch context; recorded before process spawn]\n${JSON.stringify(record)}`
    } finally {
      await file.close()
    }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? '[Saved match launch context] Not available for this match; reporting client version may differ from the launch version.'
      : '[Saved match launch context] Unavailable or invalid.'
  }
}
