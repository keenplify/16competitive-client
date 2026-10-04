import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_CONSOLE_BYTES = 64 * 1024
const MAX_CONFIG_BYTES = 32 * 1024
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

async function readReportFile(
  directory: string,
  relative: string,
  label: string,
  maxBytes: number,
  tail: boolean
): Promise<string | null> {
  try {
    const file = await open(
      join(directory, relative),
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    )
    try {
      const info = await file.stat()
      if (!info.isFile()) return null
      const size = Math.min(info.size, maxBytes)
      const bytes = Buffer.alloc(size)
      const { bytesRead } = await file.read(
        bytes,
        0,
        size,
        tail ? Math.max(0, info.size - size) : 0
      )
      let contents = bytes.subarray(0, bytesRead).toString('utf8')
      const truncated = info.size > size
      // Discard partial lines so truncation cannot hide a credential key.
      if (truncated) {
        const boundary = tail ? contents.indexOf('\n') : contents.lastIndexOf('\n')
        contents =
          boundary < 0 ? '' : tail ? contents.slice(boundary + 1) : contents.slice(0, boundary)
      }
      return `[${label}: ${relative}; modified ${info.mtime.toISOString()}${truncated ? '; truncated' : ''}]\n${redactReportLogs(contents)}`
    } finally {
      await file.close()
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT'
      ? null
      : `[${label}: ${relative}] Could not read (${code ?? 'unknown error'}).`
  }
}

export async function collectGameConsoleLogs(fallbackDirectory?: string): Promise<string> {
  const directory = lastGameDirectory ?? fallbackDirectory
  if (!directory) return '[qconsole.log] No game installation available.'
  const sections: string[] = []
  for (const relative of ['qconsole.log', join('cstrike', 'qconsole.log')]) {
    const section = await readReportFile(
      directory,
      relative,
      'qconsole.log',
      MAX_CONSOLE_BYTES,
      true
    )
    if (section !== null) sections.push(section)
  }
  return sections.join('\n\n') || '[qconsole.log] Not found in the last game installation.'
}

/** Capture the on-disk Counter-Strike config at report time, without changing it. */
export async function collectGameConfigSnapshot(fallbackDirectory?: string): Promise<string> {
  const directory = lastGameDirectory ?? fallbackDirectory
  if (!directory) return '[config.cfg snapshot] No game installation available.'
  return (
    (await readReportFile(
      directory,
      join('cstrike', 'config.cfg'),
      'config.cfg snapshot',
      MAX_CONFIG_BYTES,
      false
    )) ?? '[config.cfg snapshot] Not found in the last game installation.'
  )
}
