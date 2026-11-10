import { matchmakingDiagnostics } from '../matchmaking-diagnostics'
import { requestAdminRestart } from './admin-restart'
import { parseNativeVoicePreferences, type NativeVoicePreferences } from '../../shared/native-voice'
import { app, BrowserWindow } from 'electron'
import { MATCHMAKING_CHANNELS } from '../../shared/matchmaking'
import { parseGameLaunchProgress, type GameLaunchProgress } from '../../shared/game-launch-progress'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, constants } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getSessionToken, getSessionUsername } from '../auth'
import { API_BASE_URL } from '../config'
import { serializeCrosshairConfig } from '../../shared/crosshair'
import type { GameSettings } from '../../shared/game-settings'

let active: {
  id: string
  child: ChildProcess
  exited: Promise<void>
  settings: GameSettings
  connected: boolean
} | null = null
export function standaloneSessionStatus(id: unknown): { owned: boolean; connected: boolean } {
  return {
    owned: typeof id === 'string' && active?.id === id,
    connected: active?.id === id && active?.connected === true
  }
}
export async function stopStandaloneSession(): Promise<void> {
  if (handoffCommitted || !active) return
  const session = active
  if (!session.child.stdin?.writableEnded) session.child.stdin?.end('{"stop":true}\n')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      session.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Native game cleanup is still running')), 60000)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
export function updateStandaloneSettings(settings: GameSettings): void {
  if (!active || handoffCommitted || active.child.stdin?.writableEnded) return
  active.settings = settings
  active.child.stdin?.write(`${JSON.stringify({ settings: sessionPreferences(settings) })}\n`)
}
let handoffCommitted = false
let storageAdminRestart: Promise<never> | null = null

/** An explicit desktop launch retry may request UAC for a protected game folder.
 * Only the verified launcher is elevated; no ACLs or session credentials change.
 */
export async function withGameStorageApproval<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'match.assets.storageDenied' ||
      process.platform !== 'win32' ||
      !app.isPackaged ||
      process.argv.includes('--admin-game-retry') ||
      process.argv.includes('--native-helper-runtime')
    )
      throw error
    if (!storageAdminRestart) {
      storageAdminRestart = (async (): Promise<never> => {
        try {
          const helper = await helperExecutable()
          await stopStandaloneSession()
          await requestAdminRestart(helper, process.execPath, await hashFile(process.execPath))
        } catch (failure) {
          if (
            failure instanceof Error &&
            (failure.message === 'match.launch.adminCancelled' ||
              failure.message === 'match.launch.adminFailed')
          )
            throw failure
          throw new Error('match.launch.adminFailed', { cause: failure })
        }
        throw new Error('match.launch.adminRestarting')
      })()
    }
    try {
      return await storageAdminRestart
    } finally {
      storageAdminRestart = null
    }
  }
}
export function isStandaloneHandoffCommitted(): boolean {
  return handoffCommitted
}

let voiceOwner: string | null = null
let voicePreferences: NativeVoicePreferences = { enabled: false, openMic: false, peers: {} }
export function setStandaloneVoice(value: unknown): void {
  voicePreferences = parseNativeVoicePreferences(value)
  voiceOwner = getSessionToken()
  if (active) updateStandaloneSettings(active.settings)
}

async function hashFile(path: string): Promise<string> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024 * 1024)
    throw new Error('Invalid standalone executable')
  const digest = createHash('sha256')
  for await (const bytes of createReadStream(path)) digest.update(bytes)
  return digest.digest('hex')
}

async function helperExecutable(): Promise<string> {
  const name = `competitive16-web-helper${process.platform === 'win32' ? '.exe' : ''}`
  const source = app.isPackaged
    ? join(process.resourcesPath, 'session-helper', name)
    : join(app.getAppPath(), 'web-helper', 'target', 'debug', name)
  const digest = await hashFile(source)
  if (app.isPackaged) {
    const manifest = JSON.parse(await readFile(join(dirname(source), 'manifest.json'), 'utf8')) as {
      sha256?: unknown
    }
    if (manifest.sha256 !== digest) throw new Error('Standalone helper integrity check failed')
  }
  // AppImage mounts disappear with Electron. The owned copy must outlive it.
  await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 })
  const root = await realpath(app.getPath('userData'))
  let directory = root
  for (const part of ['session-helper', digest]) {
    directory = join(directory, part)
    await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Invalid standalone helper directory')
  }
  const destination = join(directory, name)
  await copyFile(source, destination, constants.COPYFILE_EXCL).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    }
  )
  if ((await hashFile(destination)) !== digest)
    throw new Error('Standalone helper integrity check failed')
  await chmod(destination, 0o700)
  return destination
}

/** Feature gate for rolling releases; normal helper verification still applies. */
export async function standaloneSupportsCs13(): Promise<boolean> {
  try {
    const executable = await helperExecutable()
    const info = await lstat(executable)
    if (!info.isFile() || info.size > 128 * 1024 * 1024) return false
    if (!(await readFile(executable)).includes(Buffer.from('--supports-native-cs13'))) return false
    return await new Promise<boolean>((resolve) => {
      const child = spawn(executable, ['--supports-native-cs13'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      let output = ''
      const timer = setTimeout(() => {
        child.kill()
        resolve(false)
      }, 5000)
      child.stdout.on('data', (bytes) => {
        output += String(bytes)
        if (output.length > 32) {
          child.kill()
          clearTimeout(timer)
          resolve(false)
        }
      })
      child.once('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        resolve(code === 0 && output.trim() === 'true')
      })
    })
  } catch {
    return false
  }
}

/** Transfer a dedicated short-lived login, never the desktop account token. */
export async function launchStandaloneSession(
  matchId: string,
  apiOrigin: string | undefined,
  settings: GameSettings,
  onExit?: (event: { code: number | null; signal: string | null }) => void,
  legacy?: { folderPath: string; modDirectory: 'cstrike' | 'cstrk13' }
): Promise<void> {
  return launchStandaloneTarget({ matchId }, apiOrigin, settings, onExit, legacy)
}

export async function launchStandalonePartner(
  partner: { serverId: string; groupId?: string; communityId?: string },
  apiOrigin: string,
  settings: GameSettings
): Promise<void> {
  return launchStandaloneTarget({ partner }, apiOrigin, settings)
}

function sessionPreferences(settings: GameSettings) {
  return {
    display: settings.display,
    currentDisplayResolution: settings.currentDisplayResolution,
    fastSwitchEnabled: settings.fastSwitchEnabled,
    enhancementsEnabled: settings.nextClientIntegrationEnabled,
    lightweightHud: true,
    killCardsEnabled: settings.killCardsEnabled,
    crosshairConfig: serializeCrosshairConfig(settings.crosshair),
    playerPingKey: settings.playerPingKey,
    voicePttKeys: settings.voicePttKeys,
    voice:
      voiceOwner === getSessionToken()
        ? voicePreferences
        : { enabled: false, openMic: false, peers: {} }
  }
}

let launchPending = false
let diagnosticTarget: string | null = null
let diagnosticPhase: string | null = null
let diagnosticAttempt: string | null = null
function announceProgress(progress: GameLaunchProgress): void {
  console.info('[GameLaunch] preparation progress', progress)
  if (progress.phase !== diagnosticPhase) {
    diagnosticPhase = progress.phase
    matchmakingDiagnostics.record('preparation_progress', {
      type: 'game_process_preparation',
      matchId: diagnosticTarget,
      attemptId: diagnosticAttempt,
      ...progress
    })
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed())
      window.webContents.send(MATCHMAKING_CHANNELS.event, {
        type: 'game_launch_progress',
        ...progress
      })
  }
}

async function launchStandaloneTarget(
  ...args: Parameters<typeof launchStandaloneTargetInner>
): Promise<void> {
  if (launchPending) throw new Error('A native game session is being prepared')
  launchPending = true
  matchmakingDiagnostics.setOwner(getSessionUsername())
  diagnosticTarget = 'matchId' in args[0] ? args[0].matchId : args[0].partner.serverId
  diagnosticPhase = null
  diagnosticAttempt = randomUUID()
  matchmakingDiagnostics.record('launch_requested', {
    type: 'game_process_launch',
    matchId: diagnosticTarget,
    attemptId: diagnosticAttempt,
    installationSelected: Boolean(args[2].cs16FolderPath)
  })
  announceProgress({ phase: 'checking', completed: 0, total: 0 })
  try {
    await launchStandaloneTargetInner(...args)
    announceProgress({ phase: 'ready', completed: 0, total: 0 })
  } catch (error) {
    announceProgress({ phase: 'error', completed: 0, total: 0 })
    throw error
  } finally {
    launchPending = false
    diagnosticTarget = null
    diagnosticAttempt = null
    diagnosticPhase = null
  }
}

async function launchStandaloneTargetInner(
  target:
    { matchId: string } | { partner: { serverId: string; groupId?: string; communityId?: string } },
  apiOrigin: string | undefined,
  settings: GameSettings,
  onExit?: (event: { code: number | null; signal: string | null }) => void,
  legacy?: { folderPath: string; modDirectory: 'cstrike' | 'cstrk13' }
): Promise<void> {
  const diagnosticContext = {
    matchId: 'matchId' in target ? target.matchId : target.partner.serverId,
    attemptId: diagnosticAttempt
  }
  if (active) throw new Error('A native game session is already running')
  handoffCommitted = false
  const token = getSessionToken()
  if (!token || !(legacy?.folderPath ?? settings.cs16FolderPath))
    throw new Error('Standalone session requires a signed-in account and game installation')
  const helper = await helperExecutable()
  const api = apiOrigin ?? API_BASE_URL
  const response = await fetch(`${api}/auth/web-handoff/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) throw new Error('Could not authorize standalone session')
  const handoff = (await response.json()) as { token?: unknown }
  if (typeof handoff.token !== 'string' || !/^[\w-]{32,128}$/.test(handoff.token))
    throw new Error('Invalid standalone authorization')
  const executable = await realpath(process.env.APPIMAGE || process.execPath)
  const args = app.isPackaged ? [] : [app.getAppPath()]
  if (process.argv.includes('--no-sandbox')) args.push('--no-sandbox')
  args.push('--return-from-game')
  // Competitive HUD now lives in VGUI2. An old offscreen-HUD preference
  // must not keep Electron alive for a platform match.
  const keepLauncherOpen = 'partner' in target && settings.lightweightHud === false
  const request = {
    protocol: 1,
    apiOrigin: api,
    handoff: handoff.token,
    ...target,
    installation: legacy ? join(legacy.folderPath, legacy.modDirectory) : settings.cs16FolderPath,
    ...(legacy ? { game: 'cs13' } : {}),
    settings: sessionPreferences(settings),
    keepLauncherOpen,
    reopen: keepLauncherOpen ? null : { executable, sha256: await hashFile(executable), args }
  }
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.LD_PRELOAD
  delete environment.PAPAMO_SKIN_PROBE_SESSION
  const child = spawn(helper, ['--desktop-session'], {
    detached: true,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
    env: environment
  })
  const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()))
  await new Promise<void>((resolve, reject) => {
    let buffer = ''
    let ready = false
    let complete = false
    let committed = false
    let quitTimer: ReturnType<typeof setTimeout> | undefined
    const timeout = setTimeout(
      () => fail(new Error('Standalone game preparation timed out')),
      300000
    )
    const fail = (error: Error): void => {
      if (complete) {
        if (active?.child === child) {
          active.connected = false
          buffer = ''
          if (!child.stdin.writableEnded) child.stdin.end()
        }
        return
      }
      complete = true
      clearTimeout(timeout)
      if (quitTimer) clearTimeout(quitTimer)
      // EOF before commit tells Rust to clean up its owned game. Never kill a
      // helper while it may be restoring native DLLs.
      child.stdin.end()
      reject(error)
    }
    child.once('error', fail)
    child.once('exit', (code, signal) => {
      matchmakingDiagnostics.record('helper_process_exited', {
        type: 'game_process_exit',
        ...diagnosticContext,
        code,
        reason: signal
      })
      if (active?.child === child) {
        active = null
        handoffCommitted = false
        onExit?.({ code, signal })
      }
      fail(new Error('Standalone game preparation failed'))
    })
    child.stdin.on('error', fail)
    child.stdout.on('data', (bytes: Buffer) => {
      if (complete && active?.child !== child) return
      buffer += bytes.toString('utf8')
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        if (end > 8192) return fail(new Error('Invalid standalone response'))
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        let event: {
          protocol?: unknown
          event?: unknown
          connected?: unknown
          code?: unknown
          osError?: unknown
          elevated?: unknown
          errorKind?: unknown
          phase?: unknown
          completed?: unknown
          total?: unknown
        }
        try {
          event = JSON.parse(line)
        } catch {
          return fail(new Error('Invalid standalone response'))
        }
        if (event.protocol !== 1) return fail(new Error('Invalid standalone response'))
        if (event.event === 'progress') {
          const progress = parseGameLaunchProgress(event)
          if (!progress || progress.phase === 'ready' || progress.phase === 'error' || committed)
            return fail(new Error('Invalid standalone progress'))
          announceProgress(progress)
          continue
        }
        if (event.event === 'notice' && event.code === 'COSMETICS_UNAVAILABLE_CONFIG_AUTH') {
          matchmakingDiagnostics.record('helper_compatibility_fallback', {
            ...diagnosticContext,
            code: event.code
          })
          continue
        }
        if (event.event === 'error') {
          const code =
            typeof event.code === 'string' && /^[A-Z_]{1,64}$/.test(event.code)
              ? event.code
              : 'PREPARATION_FAILED'
          // Never log raw helper frames, OS messages, paths or launch arguments.
          const diagnostics =
            code === 'GAME_SPAWN_FAILED'
              ? {
                  ...(typeof event.elevated === 'boolean' ? { elevated: event.elevated } : {}),
                  ...(typeof event.osError === 'number' &&
                  Number.isInteger(event.osError) &&
                  event.osError >= -2147483648 &&
                  event.osError <= 2147483647
                    ? { osError: event.osError }
                    : {}),
                  ...(typeof event.errorKind === 'string' &&
                  /^[A-Za-z]{1,48}$/.test(event.errorKind)
                    ? { errorKind: event.errorKind }
                    : {})
                }
              : {}
          console.warn('[Standalone] preparation failed', { code, ...diagnostics })
          matchmakingDiagnostics.record('helper_failed', {
            type: 'game_process_error',
            ...diagnosticContext,
            code,
            ...diagnostics
          })
          return fail(
            new Error(
              code === 'GAME_SPAWN_FAILED' && event.osError === 740
                ? 'match.launch.adminRequired'
                : code === 'GAME_CLOSE_FAILED'
                  ? 'match.launch.closeFailed'
                  : code === 'GAME_ALREADY_RUNNING'
                    ? 'match.launch.alreadyRunning'
                    : `Standalone game preparation failed (${code})`
            )
          )
        }
        if (event.event === 'status' && committed && typeof event.connected === 'boolean') {
          if (active?.child === child) active.connected = event.connected
          continue
        }
        if (event.event === 'ready' && !ready) {
          ready = true
          child.stdin.write('{"commit":true}\n')
        } else if (event.event === 'committed' && ready && !committed) {
          committed = true
          // A helper can fail between acknowledging and the scheduled quit.
          // Keep its exit/error handlers active until the ownership transfer.
          quitTimer = setTimeout(() => {
            if (complete) return
            complete = true
            clearTimeout(timeout)
            active = {
              id: 'matchId' in target ? target.matchId : target.partner.serverId,
              child,
              exited,
              settings,
              connected: false
            }
            if (keepLauncherOpen) {
              child.stdin.write('{"release":true}\n')
              resolve()
              return
            }
            child.unref()
            handoffCommitted = true
            resolve()
            // Preserve stdin until process exit: Rust uses EOF to avoid racing
            // the launcher's single-instance lock on a fast game exit.
            app.quit()
          }, 150)
        } else return fail(new Error('Invalid standalone handoff state'))
      }
      if (buffer.length > 8192) return fail(new Error('Invalid standalone response'))
    })
    child.stdin.write(`${JSON.stringify(request)}\n`)
  }).catch(async (error: unknown) => {
    if (
      !(error instanceof Error) ||
      error.message !== 'match.launch.adminRequired' ||
      process.platform !== 'win32' ||
      !app.isPackaged ||
      process.argv.includes('--admin-game-retry')
    )
      throw error
    // Wait for native workers, inspector and temporary credentials to clean up.
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        exited,
        new Promise<never>((_, reject) => {
          cleanupTimer = setTimeout(() => reject(new Error('match.launch.adminFailed')), 60000)
        })
      ])
    } finally {
      if (cleanupTimer) clearTimeout(cleanupTimer)
    }
    matchmakingDiagnostics.record('admin_approval_requested', {
      type: 'game_process_elevation',
      ...diagnosticContext
    })
    await matchmakingDiagnostics.flush()
    try {
      await requestAdminRestart(helper, executable, await hashFile(executable), diagnosticContext)
    } catch (error) {
      matchmakingDiagnostics.record('admin_approval_failed', {
        type: 'game_process_elevation',
        ...diagnosticContext,
        code:
          error instanceof Error && error.message === 'match.launch.adminCancelled'
            ? 'ADMIN_RESTART_CANCELLED'
            : 'ADMIN_RESTART_FAILED'
      })
      throw error
    }
    // Keep caller failure handling deterministic if quit is delayed by cleanup.
    throw new Error('match.launch.adminRestarting')
  })
}
