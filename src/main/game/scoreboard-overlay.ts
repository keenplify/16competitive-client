import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { constants, watch, type FSWatcher } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
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
import { KillCardTracker, type KillCardView } from './kill-card-tracker'
import { KillCardPrediction, parseLocalDeathNotices } from './kill-card-prediction'

const MAX_FEED_BYTES = 8192
const MAX_FRAME_BYTES = 512 * 1024
const FRAME_WIDTH = 1104
const FRAME_HEIGHT = 720
const CARD_WIDTH = 480
const CARD_HEIGHT = 280
const INTERVAL_MS = 100
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
  private readonly killCardTracker = new KillCardTracker()
  private readonly killCardPrediction = new KillCardPrediction()
  private killCardsEnabled = true
  private lastKillCardState: string | null = null
  private lastKillCardKinds = ''
  private cardStateTask: Promise<void> = Promise.resolve()
  private eventWatcher: FSWatcher | null = null
  private eventReadTask: Promise<void> | null = null
  private eventOffset = 0
  private readonly window: BrowserWindow
  private readonly cardsWindow: BrowserWindow
  private readonly readSnapshot: (directory: string) => Snapshot
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private refreshTask: Promise<void> | null = null
  private frameTask: Promise<void> | null = null
  private cardFrameTask: Promise<void> | null = null
  private watchdog: ScoreboardWatchdog | null = null
  private rendererCrashed = false
  private rendererExitReason: string | null = null
  private feedVersion: string | null = null
  private lastFeedAt: number | null = null
  private readonly requests = new AbortController()
  private frameWriting = false
  private cardFrameWriting = false
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
    cardsWindow: BrowserWindow,
    readSnapshot: (directory: string) => Snapshot,
    windowsInstallation: WindowsCosmeticInstallation | WindowsNextClientInstallation | null
  ) {
    this.directory = directory
    this.modulePath = modulePath
    this.steamWrapperPath = join(app.getPath('userData'), 'scoreboard-steam-wrapper.sh')
    this.window = window
    this.cardsWindow = cardsWindow
    this.readSnapshot = readSnapshot
    this.windowsInstallation = windowsInstallation
    this.usesNextClientHost = windowsInstallation instanceof WindowsNextClientInstallation
    this.feedPath = join(directory, 'game/cstrike/addons/amxmodx/data/16c_scoreboard.tsv')
  }

  async updateCrosshair(crosshair: CrosshairProfile): Promise<void> {
    if (!this.stopped && !this.usesNextClientHost)
      await writeCrosshairConfig(this.directory, crosshair)
  }

  async updateKillCards(enabled: boolean): Promise<void> {
    this.killCardsEnabled = enabled
    await this.syncKillCards(this.readSnapshot(this.directory))
  }

  private async syncKillCards(snapshot: Snapshot): Promise<void> {
    const username = getSessionUsername()
    const authoritative = this.killCardTracker.update(snapshot, username)
    const cards = this.killCardPrediction.updateAuthoritative(
      authoritative,
      snapshot,
      username,
      Date.now()
    )
    await this.queueKillCardDisplay(cards)
  }

  private queueKillCardDisplay(cards: KillCardView | null): Promise<void> {
    const task = this.cardStateTask.then(() => this.writeKillCardDisplay(cards))
    this.cardStateTask = task.catch((error: unknown) =>
      console.warn('[Scoreboard] kill card state write failed', error)
    )
    return task
  }

  private async writeKillCardDisplay(cards: KillCardView | null): Promise<void> {
    if (this.stopped) return
    const state =
      this.killCardsEnabled && cards
        ? `${cards.mode} ${cards.count} ${cards.aceAt ?? 0} ${cards.side}\n`
        : null
    const kinds = this.killCardsEnabled ? (cards?.kinds ?? []).join(',') : ''
    if (state === this.lastKillCardState && kinds === this.lastKillCardKinds) return
    if (!this.cardsWindow.isDestroyed())
      this.cardsWindow.webContents.send(
        'kill-cards-count',
        this.killCardsEnabled ? (cards?.count ?? 0) : 0,
        cards?.mode ?? 'C',
        this.killCardsEnabled ? (cards?.aceAt ?? null) : null,
        cards?.side ?? 'T',
        this.killCardsEnabled ? (cards?.kinds ?? []) : []
      )
    const destination = join(this.directory, 'kill-cards.state')
    if (state === null) {
      await unlink(destination).catch(() => undefined)
      await unlink(join(this.directory, 'kill-cards.png')).catch(() => undefined)
    } else {
      const temporary = `${destination}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, state, { mode: 0o600 })
        await rename(temporary, destination)
      } finally {
        await unlink(temporary).catch(() => undefined)
      }
    }
    this.lastKillCardState = state
    this.lastKillCardKinds = kinds
    if (state !== null && !this.cardsWindow.isDestroyed()) this.cardsWindow.webContents.invalidate()
  }

  private scheduleLocalDeathRead(): void {
    if (this.stopped || this.eventReadTask) return
    this.eventReadTask = this.readLocalDeathEvents()
      .catch((error: unknown) => console.warn('[Scoreboard] local death notice read failed', error))
      .finally(() => {
        this.eventReadTask = null
      })
  }

  private async readLocalDeathEvents(): Promise<void> {
    const path = join(this.directory, 'kill-cards.events')
    const info = await lstat(path).catch(() => null)
    if (!info?.isFile() || info.size > 64 * 1024) return
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    let bytes: Buffer
    try {
      const opened = await file.stat()
      if (!opened.isFile() || opened.size > 64 * 1024) return
      bytes = await file.readFile()
    } finally {
      await file.close()
    }
    if (this.stopped || bytes.length > 64 * 1024) return
    if (bytes.length < this.eventOffset) this.eventOffset = 0
    const end = bytes.lastIndexOf(10)
    if (end < this.eventOffset) return
    const lines = bytes.subarray(this.eventOffset, end + 1).toString('utf8')
    this.eventOffset = end + 1
    if (!this.killCardsEnabled || !this.feedAvailable) return
    const now = Date.now()
    for (const notice of parseLocalDeathNotices(lines)) this.killCardPrediction.predict(notice, now)
    await this.queueKillCardDisplay(this.killCardPrediction.view(now))
  }

  static async start(
    matchId: string,
    apiUrl = API_BASE_URL,
    gameRoot?: string,
    allowNextClientIntegration = true
  ): Promise<ScoreboardOverlaySession | null> {
    await cleanupQueue.wait()
    // The module follows GoldSrc's x86 architecture, not the launcher's host
    // architecture. ARM64 Linux runs the same game/module through translation.
    const supportedHost =
      (process.platform === 'linux' && ['x64', 'arm64'].includes(process.arch)) ||
      (process.platform === 'win32' && process.arch === 'x64')
    if (!supportedHost) {
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
      : join(app.getAppPath(), `resources/native/linux-${process.arch}`)
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
    let cardsWindow: BrowserWindow | null = null
    let eventWatcher: FSWatcher | null = null
    try {
      await mkdir(join(directory, 'game/cstrike/addons/amxmodx/data'), { recursive: true })
      await writeFile(join(directory, 'manifest.json'), JSON.stringify({ matchId }), {
        mode: 0o600
      })
      await writeFile(join(directory, 'overlay.mode'), 'scoreboard\n', { mode: 0o600 })
      await writeFile(join(directory, 'overlay.enabled'), '1\n', { mode: 0o600 })
      await writeFile(join(directory, 'scoreboard.visible'), '0\n', { mode: 0o600 })
      const gameSettings = await getGameSettings()
      if (!nextClient) await writeCrosshairConfig(directory, gameSettings.crosshair)
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
      cardsWindow = new BrowserWindow({
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
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
        cardsWindow,
        readSnapshot,
        windowsInstallation
      )
      createdSession.killCardsEnabled = gameSettings.killCardsEnabled
      cardsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      cardsWindow.webContents.on('will-navigate', (event) => event.preventDefault())
      cardsWindow.webContents.setFrameRate(30)
      cardsWindow.webContents.on('paint', (_event, _dirty, image) => {
        if (
          createdSession.stopped ||
          createdSession.cardFrameWriting ||
          !createdSession.killCardsEnabled ||
          !createdSession.feedAvailable
        )
          return
        if (
          createdSession.lastKillCardState === null ||
          /^. 0 /.test(createdSession.lastKillCardState)
        )
          return
        const size = image.getSize()
        if (size.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) return
        const png = image.toPNG()
        if (!png.length || png.length > 128 * 1024) return
        const destination = join(directory, 'kill-cards.png')
        const temporary = `${destination}.tmp`
        createdSession.cardFrameWriting = true
        createdSession.cardFrameTask = writeFile(temporary, png, { mode: 0o600 })
          .then(() => rename(temporary, destination))
          .catch((error: unknown) =>
            console.warn('[Scoreboard] kill card frame write failed', error)
          )
          .finally(() => {
            createdSession.cardFrameWriting = false
          })
      })
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
      await cardsWindow.loadFile(join(assets, 'index.html'), { query: { overlay: 'kill-cards' } })
      cardsWindow.webContents.startPainting()
      eventWatcher = watch(directory, (_event, filename) => {
        if (filename?.toString() === 'kill-cards.events') createdSession.scheduleLocalDeathRead()
      })
      createdSession.eventWatcher = eventWatcher
      createdSession.eventWatcher.on('error', (error) => {
        console.warn('[Scoreboard] local death notice watcher failed', error)
        createdSession.eventWatcher?.close()
        createdSession.eventWatcher = null
      })
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
      eventWatcher?.close()
      if (window && !window.isDestroyed()) window.close()
      if (cardsWindow && !cardsWindow.isDestroyed()) cardsWindow.close()
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
      if (!feed || !/^#16c-scoreboard-v(?:[2-9]|1[0-4])\t/.test(feed))
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
      await this.syncKillCards(snapshot)
      this.scheduleLocalDeathRead()
    } catch (error) {
      if (this.stopped) return
      // The server may be replacing its snapshot during a kill. Keep the last
      // authenticated frame through one short read gap instead of flashing off.
      if (this.feedAvailable && this.lastFeedAt !== null && Date.now() - this.lastFeedAt < 1000) {
        await this.queueKillCardDisplay(this.killCardPrediction.view(Date.now()))
        return
      }
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
      await this.syncKillCards(null)
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
        if (this.lastKillCardState !== null && !this.cardsWindow.isDestroyed())
          this.cardsWindow.webContents.invalidate()
      }
    }
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.requests.abort()
    this.eventWatcher?.close()
    this.eventWatcher = null
    const watchdogTask = this.watchdog?.stop()
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (!this.window.isDestroyed()) this.window.close()
    if (!this.cardsWindow.isDestroyed()) this.cardsWindow.close()
    cleanupQueue.enqueue(async () => {
      await Promise.allSettled([
        this.refreshTask,
        this.frameTask,
        this.cardFrameTask,
        this.cardStateTask,
        this.eventReadTask,
        watchdogTask
      ])
      if (this.windowsInstallation) await this.windowsInstallation.queueRestore()
      else await rm(this.directory, { recursive: true, force: true })
    })
  }
}
