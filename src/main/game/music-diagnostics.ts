import { lstat, open } from 'node:fs/promises'
import { join } from 'node:path'

export function parseMusicDiagnostics(value: unknown, matchId: string): string | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (
    data.version !== 1 ||
    data.matchId !== matchId ||
    !['ready', 'partial', 'unavailable'].includes(String(data.status))
  )
    return null
  const numbers = [data.completed, data.total, data.failed]
  if (
    !numbers.every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 4096)
  )
    return null
  const [completed, total, failed] = numbers as number[]
  if (completed + failed > total) return null
  return `Delivery: ${data.status}; verified ${completed}/${total}; failed ${failed}.\nThis describes optional local audio delivery, not in-game playback or volume.`
}

export async function musicDeliveryReport(directory: string, matchId?: string): Promise<string> {
  const heading = '[Music Kit delivery]'
  const missing = `${heading}\nUnavailable (no recent delivery diagnostics for this match).`
  if (!matchId) return missing
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    const path = join(directory, 'music-diagnostics.json')
    const metadata = await lstat(path)
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 2048) return missing
    file = await open(path, 'r')
    const actual = await file.stat()
    const age = Date.now() - actual.mtimeMs
    if (!actual.isFile() || actual.size > 2048 || age < 0 || age > 10 * 60_000) return missing
    const buffer = Buffer.alloc(2049)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    if (bytesRead > 2048) return missing
    const summary = parseMusicDiagnostics(
      JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')),
      matchId
    )
    return summary ? `${heading}\n${summary}` : missing
  } catch {
    return missing
  } finally {
    await file?.close()
  }
}
