import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newerVersion } from '../shared/renderer-update'

const path = (): string => join(app.getPath('userData'), 'pending-launcher-install.json')

export function recordInstallerAttempt(version: string): void {
  if (!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version)) throw new Error('Invalid installer version.')
  mkdirSync(app.getPath('userData'), { recursive: true })
  const temporary = `${path()}.tmp`
  writeFileSync(temporary, JSON.stringify({ version }), { mode: 0o600 })
  renameSync(temporary, path())
}

/** The installer runs after Electron exits, so its failure is observed next launch. */
export function unfinishedInstallerVersion(): string | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path(), 'utf8'))
    const version = (value as { version?: unknown } | null)?.version
    if (typeof version !== 'string' || !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version)) return null
    if (newerVersion(version, app.getVersion())) return version
    unlinkSync(path())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn('[Updater] Could not read installation recovery state.')
  }
  return null
}
