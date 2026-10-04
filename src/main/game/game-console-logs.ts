import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_CONSOLE_BYTES = 64 * 1024
let lastGameDirectory: string | null = null

// Keep the last launch location after exit so late/manual reports include it.
export function setGameConsoleDirectory(directory: string): void {
  lastGameDirectory = directory
}

export function redactReportLogs(logs: string): string {
  return logs
    .split('\n')
    .map((line) =>
      /\b(?:_16c|password|rcon_password|sv_password|joinToken|join_token|authorization|access_token|refresh_token)\b/i.test(
        line
      )
        ? '[redacted line containing credentials]'
        : line
    )
    .join('\n')
}

export async function collectGameConsoleLogs(fallbackDirectory?: string): Promise<string> {
  const directory = lastGameDirectory ?? fallbackDirectory
  if (!directory) return '[qconsole.log] No game installation available.'
  const sections: string[] = []
  for (const relative of ['qconsole.log', join('cstrike', 'qconsole.log')]) {
    const path = join(directory, relative)
    try {
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const info = await file.stat()
        if (!info.isFile()) continue
        const size = Math.min(info.size, MAX_CONSOLE_BYTES)
        const bytes = Buffer.alloc(size)
        const { bytesRead } = await file.read(bytes, 0, size, Math.max(0, info.size - size))
        let tail = bytes.subarray(0, bytesRead).toString('utf8')
        // A truncated first line may have lost the credential key: discard it.
        if (info.size > size) {
          const firstNewline = tail.indexOf('\n')
          tail = firstNewline < 0 ? '' : tail.slice(firstNewline + 1)
        }
        sections.push(
          `[qconsole.log: ${relative}; modified ${info.mtime.toISOString()}]\n${redactReportLogs(tail)}`
        )
      } finally {
        await file.close()
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT')
        sections.push(`[qconsole.log: ${relative}] Could not read (${code ?? 'unknown error'}).`)
    }
  }
  return sections.join('\n\n') || '[qconsole.log] Not found in the last game installation.'
}
