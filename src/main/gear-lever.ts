import { spawn } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'

const GEAR_LEVER_APP_ID = 'it.mijorus.gearlever'
const GITHUB_REPOSITORY = 'keenplify/16competitive-client'
const GITHUB_RELEASE_FILE = '16competitive-client-*.AppImage'
const COMMAND_TIMEOUT_MS = 15_000
const UPDATE_COMMAND_TIMEOUT_MS = 30 * 60_000
const MAX_OUTPUT_LENGTH = 1024 * 1024

interface GearLeverApp {
  path: string
  manager: string | null
}

interface RunGearLeverOptions {
  timeoutMs?: number
  onStdout?: (output: string) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseInstalledApps(output: string): GearLeverApp[] {
  const document: unknown = JSON.parse(output)
  if (!isRecord(document) || document.schema_version !== 1 || !Array.isArray(document.installed)) {
    throw new Error('Gear Lever returned an unsupported app-list format.')
  }

  return document.installed.flatMap((value): GearLeverApp[] => {
    if (!isRecord(value) || typeof value.path !== 'string') return []
    if (value.manager !== null && typeof value.manager !== 'string') return []
    return [{ path: value.path, manager: value.manager }]
  })
}

function runGearLever(args: string[], options: RunGearLeverOptions = {}): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = spawn('flatpak', ['run', GEAR_LEVER_APP_ID, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      timer = null
      if (error) reject(error)
      else resolveOutput(stdout)
    }

    const appendOutput = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8')
      if (next.length > MAX_OUTPUT_LENGTH) {
        child.kill()
        finish(new Error('Gear Lever produced too much output.'))
      }
      return next
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk)
      if (!settled) options.onStdout?.(stdout)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk)
    })
    child.once('error', (error) => finish(error))
    child.once('close', (code) => {
      if (code === 0) finish()
      else finish(new Error(stderr.trim() || `Gear Lever exited with code ${code ?? 'unknown'}.`))
    })

    timer = setTimeout(() => {
      child.kill()
      finish(new Error('Gear Lever did not respond in time.'))
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS)
  })
}

/** Verifies that the Gear Lever Flatpak is installed and callable. */
export async function ensureGearLeverAvailable(): Promise<void> {
  if (!getCurrentAppImagePath()) return

  const output = await runGearLever(['--list-installed', '--json'])
  parseInstalledApps(output)
}

export function getCurrentAppImagePath(): string | null {
  if (process.platform !== 'linux') return null

  const appImagePath = process.env.APPIMAGE
  if (!appImagePath || !isAbsolute(appImagePath) || appImagePath.includes('\0')) return null
  return appImagePath
}

/** Adds the official update source when this AppImage is Gear Lever-managed but unconfigured. */
export async function configureGearLeverUpdates(): Promise<void> {
  const appImagePath = getCurrentAppImagePath()
  if (!appImagePath) return

  const output = await runGearLever(['--list-installed', '--json'])
  const managedApp = parseInstalledApps(output).find(
    (installedApp) => resolve(installedApp.path) === resolve(appImagePath)
  )
  if (!managedApp || managedApp.manager) return

  await runGearLever([
    '--set-update-source',
    appImagePath,
    '--manager',
    'GithubUpdater',
    'allow_prereleases=false',
    `repo=${GITHUB_REPOSITORY}`,
    `repo_filename=${GITHUB_RELEASE_FILE}`
  ])
}

/** Replaces the running Linux AppImage through Gear Lever without requiring user interaction. */
export async function updateCurrentAppImageWithGearLever(
  onProgress?: (percent: number) => void
): Promise<void> {
  const appImagePath = getCurrentAppImagePath()
  if (!appImagePath) throw new Error('The launcher is not running from a Linux AppImage.')

  await configureGearLeverUpdates()

  let lastProgress = -1
  const output = await runGearLever(['--update', appImagePath, '--yes', '--force'], {
    timeoutMs: UPDATE_COMMAND_TIMEOUT_MS,
    onStdout: (currentOutput) => {
      const matches = [...currentOutput.matchAll(/Status:\s*(\d+)%/g)]
      const latest = matches.at(-1)?.[1]
      if (!latest) return

      const percent = Math.max(0, Math.min(100, Number.parseInt(latest, 10)))
      if (!Number.isFinite(percent) || percent === lastProgress) return
      lastProgress = percent
      onProgress?.(percent)
    }
  })

  if (!output.includes('updated successfully')) {
    throw new Error('Gear Lever finished without updating this AppImage.')
  }

  if (lastProgress !== 100) onProgress?.(100)
}
