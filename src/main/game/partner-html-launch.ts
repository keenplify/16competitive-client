import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ScoreboardOverlaySession } from './scoreboard-overlay'
import { cachePartnerUi } from './partner-html-renderer'
import { getGameSettings } from './game-settings'
import { registerManagedAdapterShutdown } from './managed-session-registry'
import {
  closeLinuxCounterStrikeProcesses,
  closeWindowsCounterStrikeProcesses,
  getLinuxCounterStrikeProcessIds,
  isSteamRunning
} from './cs16-launcher'
import { ensureSteamScoreboardOption } from './steam-scoreboard-options'
import { verifyPackagedHelper } from '../anticheat/helper-integrity'
import { verifyCosmeticModule, verifyHelperRelease } from '../anticheat/helper-release-verifier'
import releaseConfig from '../../../helper-release.json'
import { resolveServiceApiUrl } from '../matchmaking-regions'
import type { PartnerUiPage } from '../../shared/partner-ui'
import type { Cs16LaunchTarget } from './cs16-installation'
import { partnerLaunchArguments } from '../../shared/partner-launch'

let active: {
  session: ScoreboardOverlaySession
  root: string
  executable: string
  child: ChildProcess | null
  monitor: ReturnType<typeof setInterval> | null
} | null = null

async function finish(closeGame: boolean): Promise<void> {
  const owned = active
  if (!owned) return
  active = null
  if (owned.monitor) clearInterval(owned.monitor)
  try {
    if (closeGame) {
      if (process.platform === 'win32') await closeWindowsCounterStrikeProcesses(owned.executable)
      if (process.platform === 'linux') await closeLinuxCounterStrikeProcesses(owned.root)
    }
    owned.session.stop()
    await ScoreboardOverlaySession.waitForCleanup()
  } catch (error) {
    active = owned
    throw error
  }
}
registerManagedAdapterShutdown(() => finish(true))

async function windowsGamePids(executable: string): Promise<number[]> {
  const code =
    '$ErrorActionPreference="Stop"; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and [String]::Equals($_.ExecutablePath,$env:C16_UI_GAME,[StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId }'
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(code, 'utf16le').toString('base64')
      ],
      {
        windowsHide: true,
        env: { ...process.env, C16_UI_GAME: executable },
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )
    let output = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Game process query timed out'))
    }, 4000)
    child.stdout.on('data', (bytes) => {
      output += String(bytes)
      if (output.length > 4096) child.kill()
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (code !== 0) reject(new Error('Game process query failed'))
      else
        resolve(
          output
            .split(/\s+/)
            .filter((s) => /^\d+$/.test(s))
            .map(Number)
        )
    })
  })
}
async function approvedPartnerModule(api: URL): Promise<boolean> {
  const native = app.isPackaged
    ? join(process.resourcesPath, 'native')
    : join(
        app.getAppPath(),
        'resources/native',
        `${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`
      )
  const binary = join(
    native,
    process.platform === 'win32' ? 'game-inspector.exe' : 'game-inspector'
  )
  await verifyPackagedHelper(binary, api.origin)
  const envelope: unknown = JSON.parse(await readFile(join(native, 'manifest.json'), 'utf8'))
  const manifest = verifyHelperRelease(envelope, releaseConfig.publicKeyPem)
  const module = await readFile(
    join(
      native,
      process.platform === 'win32'
        ? 'papamo-cosmetic-module-win-x86.dll'
        : 'papamo-cosmetic-module-linux-x86.so'
    )
  )
  verifyCosmeticModule(module, manifest)
  return module.includes(Buffer.from('papamo_partner_ui_v1\0'))
}

/** Called inside the existing serialized launch queue. Returns false when the
 * server/client has no compatible HTML overlay, preserving its ordinary launch. */
export async function launchPartnerHtmlGame(
  serverId: string,
  address: string,
  port: number,
  ticket: string | null,
  connectionId: string | null,
  target: Cs16LaunchTarget,
  isCurrent: () => boolean
): Promise<boolean> {
  const settings = await getGameSettings(true)
  if (
    !settings.nextClientIntegrationEnabled ||
    !ticket ||
    !connectionId ||
    !['linux', 'win32'].includes(process.platform)
  )
    return false
  let api: URL
  let pages: PartnerUiPage[]
  try {
    api = new URL(await resolveServiceApiUrl())
    pages = await cachePartnerUi(api, serverId, join(app.getPath('userData'), 'partner-ui-cache'))
    if (!pages.length || !(await approvedPartnerModule(api))) return false
  } catch (error) {
    console.warn(
      '[PartnerUI] optional UI preflight unavailable',
      error instanceof Error ? error.message : 'unknown'
    )
    return false
  }
  const root = dirname(target.gameExecutable)
  const session = await ScoreboardOverlaySession.start(
    'partner-' + serverId,
    api.origin,
    process.platform === 'win32' ? root : undefined,
    true,
    `${address}:${port}`,
    async () => {
      const owned = active
      if (owned?.session === session) {
        active = null
        if (owned.monitor) clearInterval(owned.monitor)
      }
    },
    undefined,
    { serverId, connectionId, pages }
  )
  if (!session) return false
  const owned = {
    session,
    root,
    executable: target.gameExecutable,
    child: null as ChildProcess | null,
    monitor: null as ReturnType<typeof setInterval> | null
  }
  active = owned
  try {
    if (!isCurrent()) throw new Error('Partner launch changed during UI preparation')
    if (
      process.platform === 'linux' &&
      target.distribution === 'steam' &&
      !(await ensureSteamScoreboardOption(session.steamWrapperPath, isSteamRunning))
    ) {
      await finish(false)
      return false
    }
    const args = [
      ...target.argumentPrefix,
      '-insecure',
      ...(process.platform === 'win32' ? ['-noupdate'] : []),
      ...partnerLaunchArguments(address, port, ticket)
    ]
    const child = spawn(target.executable, args, {
      shell: false,
      detached: true,
      stdio: 'ignore',
      cwd:
        process.platform === 'win32' && target.distribution === 'steam'
          ? dirname(target.executable)
          : root,
      env: {
        ...process.env,
        ...(process.platform === 'linux' && target.distribution !== 'steam'
          ? {
              PAPAMO_SKIN_PROBE_SESSION: session.directory,
              LD_PRELOAD: [session.modulePath, process.env.LD_PRELOAD].filter(Boolean).join(' ')
            }
          : {}),
        ...(process.platform === 'win32' && session.usesNextClientHost
          ? { PAPAMO_SKIN_PROBE_SESSION: session.directory }
          : {})
      }
    })
    owned.child = child
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
    child.unref()
    let observed = false,
      busy = false
    owned.monitor = setInterval(() => {
      if (busy || active !== owned) return
      busy = true
      void (async () => {
        const pids =
          process.platform === 'linux'
            ? await getLinuxCounterStrikeProcessIds(root)
            : await windowsGamePids(target.gameExecutable)
        if (active !== owned) return
        if (pids.length) observed = true
        else if (observed) await finish(false)
      })()
        .catch((error) =>
          console.warn(
            '[PartnerUI] game monitor failed',
            error instanceof Error ? error.message : 'unknown'
          )
        )
        .finally(() => {
          busy = false
        })
    }, 2000)
    owned.monitor.unref()
    return true
  } catch (error) {
    await finish(true)
    throw error
  }
}
