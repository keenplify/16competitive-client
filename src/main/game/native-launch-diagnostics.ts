import { createHash } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import { join } from 'node:path'
import { projectMatchDiagnostics } from '../../shared/matchmaking-diagnostics'

/** Rust browser sessions run outside Electron's in-memory diagnostic capture. */
export async function nativeLaunchReport(
  directory: string,
  owner: string | null,
  matchId?: string,
  now = Date.now()
): Promise<string> {
  const heading = '[Native helper launch failure]'
  const missing = `${heading}\nUnavailable (no recent failure for this account and match).`
  if (!owner) return missing
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    const path = join(directory, 'native-launch-failure.json')
    const metadata = await lstat(path)
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 4096) return missing
    file = await open(path, 'r')
    const actual = await file.stat()
    if (!actual.isFile() || actual.size > 4096) return missing
    const bytes = Buffer.alloc(4097)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead > 4096) return missing
    const data = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'))
    if (
      data?.version !== 1 ||
      data.ownerHash !== createHash('sha256').update(owner).digest('hex') ||
      !Number.isSafeInteger(data.at) ||
      data.at > now ||
      now - data.at > 6 * 60 * 60_000 ||
      typeof data.matchId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(data.matchId) ||
      (matchId !== undefined && data.matchId !== matchId) ||
      !['cs13', 'cs16'].includes(data.game) ||
      ![null, 'hl.exe', 'cstrike.exe', 'hl_linux'].includes(data.executable) ||
      typeof data.helperVersion !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.helperVersion) ||
      typeof data.failure?.code !== 'string' ||
      !/^[A-Z_]{1,64}$/.test(data.failure.code)
    )
      return missing
    const failure = data.failure
    // Explicit projection also protects reports from locally modified JSON.
    const safe = projectMatchDiagnostics({
      code: failure.code,
      osError:
        Number.isInteger(failure.osError) && Math.abs(failure.osError) <= 2147483648
          ? failure.osError
          : undefined,
      errorKind:
        typeof failure.errorKind === 'string' && /^[A-Za-z]{1,48}$/.test(failure.errorKind)
          ? failure.errorKind
          : undefined,
      elevated: typeof failure.elevated === 'boolean' ? failure.elevated : undefined,
      cleanupCodes: failure.cleanupCodes,
      originalCode:
        typeof failure.originalCode === 'string' && /^[A-Z_]{1,64}$/.test(failure.originalCode)
          ? failure.originalCode
          : undefined
    })
    return `${heading}\n${JSON.stringify({
      at: data.at,
      matchId: data.matchId,
      game: data.game,
      executable: data.executable,
      helperVersion: data.helperVersion,
      ...safe
    })}`
  } catch {
    return missing
  } finally {
    await file?.close()
  }
}
