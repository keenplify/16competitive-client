import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { release } from 'node:os'
import { app, BrowserWindow } from 'electron'
import { getSessionToken, getSessionUsername } from '../auth'
import { API_BASE_URL, LOCAL_DEVELOPMENT } from '../config'
import type { CrosshairProfile } from '../../shared/crosshair'
import { getGameSettings } from './game-settings'
import { WindowsCosmeticInstallation } from './windows-cosmetic-installation'
import { isNextClientInstallation } from './windows-cosmetic-compatibility'
import { WindowsNextClientInstallation } from './windows-nextclient-installation'
import { buildSteamScoreboardWrapper } from './steam-scoreboard-wrapper'
import { ScoreboardCleanupQueue } from './scoreboard-cleanup'
import { ScoreboardWatchdog } from './scoreboard-watchdog'
import type { ScoreboardHealth } from './scoreboard-watchdog'
import { createScoreboardReporter } from './scoreboard-report'
import type { ScoreboardIncident } from './scoreboard-report'
import { reportDiagnosticIssue } from '../diagnostic-logs'

const MAX_FEED_BYTES = 8192
const MAX_FRAME_BYTES = 512 * 1024
const FRAME_WIDTH = 1104
const FRAME_HEIGHT = 720
const INTERVAL_MS = 500
const cleanupQueue = new ScoreboardCleanupQueue()

const writeCrosshairConfig = async (
  directory: string,
  crosshair: CrosshairProfile
): Promise<void> => {
  const color = [1, 3, 5].map((index) => parseInt(crosshair.color.slice(index, index + 2), 16))
  const destination = join(directory, 'crosshair.conf')
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    await writeFile(
      temporary,
      [
        ...color,
        crosshair.size,
        crosshair.gap,
        crosshair.thickness,
        crosshair.outline,
        crosshair.opacity,
        Number(crosshair.dot),
        Number(crosshair.dynamic)
      ].join(' ') + '\n',
      { mode: 0o600 }
    )
    await rename(temporary, destination)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

const readBoundedFeed = async (response: Response): Promise<string | null> => {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_FEED_BYTES) return null
      chunks.push(value)
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total))
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

type Snapshot = {
  map: string
  round: number
  roundWinners: string | null
  mode: 'ffa' | 'competitive'
  players: {
    id: number
    team: number
    name: string
    kills: number
    assists: number
    deaths: number
    ping: number
    alive: boolean
    bot: boolean
  }[]
} | null

export class ScoreboardOverlaySession {
  readonly directory: string
  readonly modulePath: string
  readonly steamWrapperPath: string
  readonly usesNextClientHost: boolean
  private readonly feedPath: string
  private readonly window: BrowserWindow
  private readonly readSnapshot: (directory: string) => Snapshot
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private refreshTask: Promise<void> | null = null
  private frameTask: Promise<void> | null = null
  private watchdog: ScoreboardWatchdog | null = null
  private rendererCrashed = false
  private rendererExitReason: string | null = null
  private feedVersion: string | null = null
  private lastFeedAt: number | null = null
  private readonly requests = new AbortController()
  private frameWriting = false
  private stopped = false
  private feedAvailable = false
  private reportedUnavailable = false
  private feedOutageAt: number | null = null
  private readonly reportIncident = createScoreboardReporter(reportDiagnosticIssue)
  private readonly windowsInstallation:
    WindowsCosmeticInstallation | WindowsNextClientInstallation | null

  private constructor(
    private readonly matchId: string,
    private readonly apiUrl: URL,
    directory: string,
    modulePath: string,
    window: BrowserWindow,
    readSnapshot: (directory: string) => Snapshot,
    windowsInstallation: WindowsCosmeticInstallation | WindowsNextClientInstallation | null
  ) {
    this.directory = directory
    this.modulePath = modulePath
    this.steamWrapperPath = join(app.getPath('userData'), 'scoreboard-steam-wrapper.sh')
    this.window = window
    this.readSnapshot = readSnapshot
    this.windowsInstallation = windowsInstallation
    this.usesNextClientHost = windowsInstallation instanceof WindowsNextClientInstallation
    this.feedPath = join(directory, 'game/cstrike/addons/amxmodx/data/16c_scoreboard.tsv')
  }

  async updateCrosshair(crosshair: CrosshairProfile): Promise<void> {
    if (!this.stopped && !this.usesNextClientHost)
      await writeCrosshairConfig(this.directory, crosshair)
  }

  static async start(
    matchId: string,
    apiUrl = API_BASE_URL,
    gameRoot?: string,
    allowNextClientIntegration = true
  ): Promise<ScoreboardOverlaySession | null> {
    await cleanupQueue.wait()
    if (!['linux', 'win32'].includes(process.platform) || process.arch !== 'x64') {
      console.warn('[Scoreboard] custom HUD unavailable', {
        matchId,
        reason: 'unsupported platform or architecture',
        platform: process.platform,
        architecture: process.arch
      })
      return null
    }
    if (process.platform === 'win32' && !gameRoot) {
      console.warn('[Scoreboard] custom HUD unavailable', {
        matchId,
        reason: 'Windows game root was not provided'
      })
      return null
    }
    const backend = new URL(apiUrl)
    if (
      backend.protocol !== 'https:' &&
      !(LOCAL_DEVELOPMENT && ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname))
    ) {
      console.warn('[Scoreboard] custom HUD unavailable', {
        matchId,
        reason: 'live scoreboard endpoint is not HTTPS',
        protocol: backend.protocol
      })
      return null
    }
    const native = app.isPackaged
      ? join(process.resourcesPath, 'native')
      : join(app.getAppPath(), 'resources/native/linux-x64')
    const modulePath = join(native, 'papamo-cosmetic-module-linux-x86.so')
    if (process.platform === 'linux' && !(await stat(modulePath).catch(() => null))?.isFile()) {
      console.warn('[Scoreboard] custom HUD unavailable', {
        matchId,
        reason: 'packaged Linux cosmetic module is missing',
        modulePath
      })
      return null
    }
    const assets = app.isPackaged
      ? join(process.resourcesPath, 'scoreboard')
      : join(app.getAppPath(), 'resources/scoreboard')
    const nextClient = process.platform === 'win32' && (await isNextClientInstallation(gameRoot!))
    const windowsInstallation =
      process.platform === 'win32'
        ? nextClient
          ? allowNextClientIntegration
            ? await WindowsNextClientInstallation.install(gameRoot!)
            : null
          : await WindowsCosmeticInstallation.install(gameRoot!)
        : null
    if (process.platform === 'win32' && !windowsInstallation) {
      console.warn('[Scoreboard] custom HUD unavailable', {
        matchId,
        reason:
          nextClient && !allowNextClientIntegration
            ? 'NextClient native HUD integration is disabled for this match after an earlier startup failure'
            : 'Windows native HUD integration could not be installed',
        nextClient,
        allowNextClientIntegration
      })
      return null
    }
    if (nextClient) {
      console.info('[Scoreboard] NextClient HUD diagnostics', {
        matchId,
        scoreboard: 'waiting for authenticated live scoreboard feed',
        teammateTags: 'requires a competitive live scoreboard feed',
        crosshair: 'disabled by the current NextClient integration'
      })
    }
    const directory =
      windowsInstallation?.sessionDirectory ??
      (await mkdtemp(join(app.getPath('userData'), `scoreboard-${randomUUID()}-`)))
    let window: BrowserWindow | null = null
    try {
      await mkdir(join(directory, 'game/cstrike/addons/amxmodx/data'), { recursive: true })
      await writeFile(join(directory, 'manifest.json'), JSON.stringify({ matchId }), {
        mode: 0o600
      })
      await writeFile(join(directory, 'overlay.mode'), 'scoreboard\n', { mode: 0o600 })
      await writeFile(join(directory, 'overlay.enabled'), '1\n', { mode: 0o600 })
      await writeFile(join(directory, 'scoreboard.visible'), '0\n', { mode: 0o600 })
      if (!nextClient) await writeCrosshairConfig(directory, (await getGameSettings()).crosshair)
      // Steam starts app 10 from its own process, so the environment on
      // `steam -applaunch` is lost. A Steam Launch Options wrapper runs inside
      // the authenticated launch and reads this per-match session. It also
      // works for normal Steam launches: without an active session it simply
      // executes Valve's original command.
      await writeFile(
        join(app.getPath('userData'), 'scoreboard-steam-wrapper.sh'),
        buildSteamScoreboardWrapper(directory, modulePath),
        {
          mode: 0o700
        }
      )
      const requireResource = createRequire(import.meta.url)
      const { readSnapshot } = requireResource(join(assets, 'scoreboard-feed.cjs')) as {
        readSnapshot: (directory: string) => Snapshot
      }
      window = new BrowserWindow({
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        frame: false,
        transparent: true,
        show: false,
        webPreferences: {
          offscreen: true,
          preload: join(assets, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false
        }
      })
      const createdSession = new ScoreboardOverlaySession(
        matchId,
        backend,
        directory,
        modulePath,
        window,
        readSnapshot,
        windowsInstallation
      )
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', (event) => event.preventDefault())
      window.webContents.setFrameRate(4)
      window.webContents.on('render-process-gone', (_event, details) => {
        if (createdSession.stopped) return
        createdSession.rendererCrashed = true
        createdSession.rendererExitReason = details.reason
        console.warn('[Scoreboard] renderer exited', { matchId, reason: details.reason })
      })
      window.webContents.on('paint', (_event, _dirty, image) => {
        if (createdSession.stopped || createdSession.frameWriting) return
        const size = image.getSize()
        if (size.width !== FRAME_WIDTH || size.height !== FRAME_HEIGHT) return
        const png = image.toPNG()
        if (!png.length || png.length > MAX_FRAME_BYTES) return
        const destination = join(directory, 'overlay.png')
        const temporary = `${destination}.tmp`
        createdSession.frameWriting = true
        createdSession.frameTask = writeFile(temporary, png, { mode: 0o600 })
          .then(() => rename(temporary, destination))
          .catch((error: unknown) => console.warn('[Scoreboard] frame write failed', error))
          .finally(() => {
            createdSession.frameWriting = false
          })
      })
      await window.loadFile(join(assets, 'index.html'))
      window.webContents.send('scoreboard-self', getSessionUsername() ?? '')
      window.webContents.startPainting()
      createdSession.timer = setInterval(() => createdSession.scheduleRefresh(), INTERVAL_MS)
      createdSession.timer.unref()
      createdSession.scheduleRefresh()
      createdSession.watchdog = new ScoreboardWatchdog(
        async () => {
          const [frame, enabled, mode] = await Promise.all([
            stat(join(directory, 'overlay.png')).catch(() => null),
            stat(join(directory, 'overlay.enabled')).catch(() => null),
            stat(join(directory, 'overlay.mode')).catch(() => null)
          ])
          return {
            feedReady:
              createdSession.feedAvailable && createdSession.readSnapshot(directory) !== null,
            rendererCrashed: createdSession.rendererCrashed,
            frameAgeMs: frame ? Date.now() - frame.mtimeMs : null,
            markersPresent: Boolean(enabled?.isFile() && mode?.isFile())
          }
        },
        async (reason, health) => {
          if (createdSession.stopped || createdSession.window.isDestroyed()) return
          console.warn('[Scoreboard] watchdog recovering overlay', { matchId, reason })
          try {
            await writeFile(join(directory, 'overlay.mode'), 'scoreboard\n', { mode: 0o600 })
            await writeFile(join(directory, 'overlay.enabled'), '1\n', { mode: 0o600 })
            if (createdSession.stopped) return
            if (reason !== 'session markers missing') {
              await createdSession.window.loadFile(join(assets, 'index.html'))
              if (createdSession.stopped) return
              createdSession.rendererCrashed = false
            }
            createdSession.window.webContents.startPainting()
            createdSession.window.webContents.invalidate()
            createdSession.scheduleRefresh()
            createdSession.reportProblem(reason, health, 'request completed')
          } catch (error) {
            createdSession.reportProblem(reason, health, 'failed', error)
            throw error
          }
        }
      )
      createdSession.watchdog.start()
      return createdSession
    } catch (error) {
      if (window && !window.isDestroyed()) window.close()
      await rm(directory, { recursive: true, force: true })
      await windowsInstallation?.restore().catch(() => undefined)
      throw error
    }
  }

  static waitForCleanup(): Promise<void> {
    return cleanupQueue.wait()
  }

  private reportProblem(
    reason: string,
    health: Partial<ScoreboardHealth>,
    recovery: ScoreboardIncident['recovery'],
    error?: unknown
  ): void {
    if (this.stopped) return
    const snapshot = this.readSnapshot(this.directory)
    void this.reportIncident({
      matchId: this.matchId,
      client: this.usesNextClientHost
        ? 'NextClient'
        : process.platform === 'win32'
          ? 'Windows GoldSrc (other/unknown)'
          : 'Linux GoldSrc',
      platform: process.platform,
      architecture: process.arch,
      osRelease: release(),
      feedVersion: this.feedVersion,
      lastFeedAgeMs: this.lastFeedAt === null ? null : Date.now() - this.lastFeedAt,
      rendererExitReason: this.rendererExitReason,
      matchState: snapshot
        ? {
            map: snapshot.map,
            round: snapshot.round,
            mode: snapshot.mode,
            playerCount: snapshot.players.length
          }
        : null,
      reason,
      health,
      recovery,
      ...(error instanceof Error ? { error: error.message } : {})
    })
  }

  private scheduleRefresh(): void {
    if (this.stopped || this.busy) return
    this.refreshTask = this.refresh().catch((error: unknown) =>
      console.warn('[Scoreboard] refresh failed', error)
    )
  }

  private async refresh(): Promise<void> {
    if (this.stopped || this.busy) return
    this.busy = true
    try {
      const token = getSessionToken()
      if (!token) throw new Error('No session')
      const response = await fetch(
        new URL(`/matches/${encodeURIComponent(this.matchId)}/live-scoreboard`, this.apiUrl),
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.any([this.requests.signal, AbortSignal.timeout(3000)])
        }
      )
      if (!response.ok || response.status === 204)
        throw new Error(`Scoreboard unavailable (HTTP ${response.status})`)
      const feed = await readBoundedFeed(response)
      if (!feed || !/^#16c-scoreboard-v(?:[2-9]|1[0-3])\t/.test(feed))
        throw new Error('Invalid scoreboard feed')
      if (this.stopped) return
      const temporary = `${this.feedPath}.tmp`
      await writeFile(temporary, feed, { mode: 0o600 })
      await rename(temporary, this.feedPath)
      const snapshot = this.readSnapshot(this.directory)
      const feedVersion = feed.match(/^#16c-scoreboard-(v\d+)/)?.[1] ?? null
      if (!this.feedAvailable)
        console.info('[Scoreboard] live match feed ready', {
          matchId: this.matchId,
          feedVersion,
          mode: snapshot?.mode ?? null
        })
      this.feedAvailable = true
      this.feedVersion = feedVersion
      this.lastFeedAt = Date.now()
      this.reportedUnavailable = false
      this.feedOutageAt = null
    } catch (error) {
      if (this.stopped) return
      this.feedOutageAt ??= Date.now()
      if (Date.now() - this.feedOutageAt >= 30000) {
        this.reportProblem(
          'live scoreboard feed unavailable',
          {
            feedReady: false,
            rendererCrashed: this.rendererCrashed
          },
          'not attempted',
          error
        )
      }
      if (!this.reportedUnavailable) {
        console.warn('[Scoreboard] live match feed unavailable; stock board remains active', {
          matchId: this.matchId,
          error: error instanceof Error ? error.message : String(error)
        })
        this.reportedUnavailable = true
      }
      this.feedAvailable = false
      await unlink(this.feedPath).catch(() => undefined)
    } finally {
      this.busy = false
      if (!this.stopped && !this.window.isDestroyed()) {
        const snapshot = this.readSnapshot(this.directory)
        const username = getSessionUsername()
        // The renderer attaches its listeners after loadFile resolves. Keep the
        // identity alongside snapshots so a late listener still receives it.
        this.window.webContents.send('scoreboard-self', username ?? '')
        this.window.webContents.send('scoreboard-snapshot', snapshot)
        this.window.webContents.invalidate()
      }
    }
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.requests.abort()
    const watchdogTask = this.watchdog?.stop()
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (!this.window.isDestroyed()) this.window.close()
    cleanupQueue.enqueue(async () => {
      await Promise.allSettled([this.refreshTask, this.frameTask, watchdogTask])
      if (this.windowsInstallation) await this.windowsInstallation.queueRestore()
      else await rm(this.directory, { recursive: true, force: true })
    })
  }
}
