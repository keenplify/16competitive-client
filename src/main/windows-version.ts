import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const windowsVersionKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'

export function parseInstalledWindowsMajorVersion(output: string): number | null {
  const match = output.match(
    /^\s*CurrentMajorVersionNumber\s+REG_DWORD\s+(0x[0-9a-f]+|\d+)(?:\s|$)/im
  )
  if (!match) return null
  const major = Number(match[1])
  return Number.isInteger(major) ? major : null
}

export async function readInstalledWindowsMajorVersion(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      'reg.exe',
      ['query', windowsVersionKey, '/v', 'CurrentMajorVersionNumber'],
      { windowsHide: true, timeout: 5_000, maxBuffer: 16 * 1024 }
    )
    return parseInstalledWindowsMajorVersion(stdout)
  } catch {
    return null
  }
}
