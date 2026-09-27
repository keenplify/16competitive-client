import { readFile, writeFile } from 'node:fs/promises'

const crosshairLine = /^\s*crosshair\s+"?([01])"?\s*$/i

/** Restore the player's stock setting after a match uses the native crosshair. */
export async function captureCrosshairConfig(path: string): Promise<() => Promise<void>> {
  const source = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  const original = source?.split(/\r?\n/).filter((line) => crosshairLine.test(line)) ?? []
  return async () => {
    const current = await readFile(path, 'utf8').catch(() => null)
    if (current === null) return
    const active = current.split(/\r?\n/).flatMap((line) => crosshairLine.exec(line)?.[1] ?? [])
    // A player changing the setting during the match owns that newer value.
    if (active.some((value) => value !== '0')) return
    const newline = current.includes('\r\n') ? '\r\n' : '\n'
    const restored = [
      ...current.split(/\r?\n/).filter((line) => !crosshairLine.test(line)),
      ...original
    ].join(newline)
    if (restored !== current) await writeFile(path, restored, 'utf8')
  }
}
