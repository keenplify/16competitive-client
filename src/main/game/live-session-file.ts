import { randomUUID } from 'node:crypto'
import { rename, unlink, writeFile } from 'node:fs/promises'

const RETRY_DELAYS_MS = [20, 40, 80, 160, 320]
const TRANSIENT_WINDOWS_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY'])

type RenameFile = typeof rename

export const replaceLiveSessionFile = async (
  temporary: string,
  destination: string,
  renameFile: RenameFile = rename,
  platform: NodeJS.Platform = process.platform,
  wait: (delayMs: number) => Promise<void> = (delayMs) =>
    new Promise((resolve) => setTimeout(resolve, delayMs))
): Promise<void> => {
  for (const delayMs of RETRY_DELAYS_MS) {
    try {
      await renameFile(temporary, destination)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (platform !== 'win32' || !code || !TRANSIENT_WINDOWS_ERRORS.has(code)) throw error
      await wait(delayMs)
    }
  }
  await renameFile(temporary, destination)
}

export const writeLiveSessionFile = async (
  destination: string,
  contents: string | Uint8Array
): Promise<void> => {
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, contents, { mode: 0o600 })
    await replaceLiveSessionFile(temporary, destination)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}
