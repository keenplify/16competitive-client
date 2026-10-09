import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { constants, watch, type FSWatcher } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { release } from 'node:os'
import { app, BrowserWindow } from 'electron'
import { getSessionToken, getSessionUsername } from '../auth'
import { API_BASE_URL, LOCAL_DEVELOPMENT } from '../config'
import { serializeCrosshairConfig, type CrosshairProfile } from '../../shared/crosshair'
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
import { writeLiveSessionFile } from './live-session-file'
import { decodeScoreboardDelta } from './scoreboard-transport'
import { mergeNativeScores, readNativeScores } from './native-scoreboard'

const MAX_FEED_BYTES = 8192
const MAX_FRAME_BYTES = 512 * 1024
const FRAME_WIDTH = 1104
const FRAME_HEIGHT = 720
const CARD_WIDTH = 480
const CARD_HEIGHT = 280
const INTERVAL_MS = 500
const cleanupQueue = new ScoreboardCleanupQueue()

const writeCrosshairConfig = async (
  directory: string,
  crosshair: CrosshairProfile
): Promise<void> => {
  const destination = join(directory, 'crosshair.conf')
  await writeLiveSessionFile(destination, serializeCrosshairConfig(crosshair))
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
  private presentationTimer: NodeJS.Timeout | null = null
  private presenting = false
  private transportFeed: string | null = null
  private transportRevision: string | null = null
  private transportMode = false
  private forceFullFeed = false
  private lastPresentation = ''
  private lastRoundAccolade: string | null = null
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
  private lastSnapshot: Snapshot = null
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
    private readonly parseSnapshot: (feed: string) => Snapshot,
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
    if (!this.stopped) await writeCrosshairConfig(this.directory, crosshair)
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
      await writeLiveSessionFile(destination, state)
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
        crosshair: 'using the 1.6 Competitive profile when the native host is ready'
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
      await Promise.all(
        [
          'native-scoreboard.tsv',
          'native-scoreboard.tmp',
          'overlay.png',
          'round-accolade.state',
          'round-accolade.support',
          'game/cstrike/addons/amxmodx/data/16c_scoreboard.tsv'
        ].map((name) => rm(join(directory, name), { force: true }))
      )
      await writeFile(join(directory, 'manifest.json'), JSON.stringify({ matchId }), {
        mode: 0o600
      })
      await writeFile(join(directory, 'overlay.mode'), 'scoreboard\n', { mode: 0o600 })
      await writeFile(join(directory, 'overlay.enabled'), '1\n', { mode: 0o600 })
      await writeFile(join(directory, 'round-accolade.support'), '1\n', { mode: 0o600 })
      await writeFile(join(directory, 'scoreboard.visible'), '0\n', { mode: 0o600 })
      const gameSettings = await getGameSettings()
      await writeCrosshairConfig(directory, gameSettings.crosshair)
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
      const { readSnapshot, parseSnapshot } = requireResource(
        join(assets, 'scoreboard-feed.cjs')
      ) as {
        readSnapshot: (directory: string) => Snapshot
        parseSnapshot: (feed: string) => Snapshot
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
        parseSnapshot,
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
        createdSession.cardFrameWriting = true
        createdSession.cardFrameTask = writeLiveSessionFile(destination, png)
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
      window.webContents.on('did-finish-load', () => {
        createdSession.lastPresentation = ''
      })
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
        createdSession.frameWriting = true
        createdSession.frameTask = writeLiveSessionFile(destination, png)
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
      createdSession.presentationTimer = setInterval(() => {
        void createdSession
          .present()
          .catch((error: unknown) => console.warn('[Scoreboard] presentation failed', error))
      }, 250)
      createdSession.presentationTimer.unref()
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

  private async present(): Promise<void> {
    if (this.stopped || this.presenting || this.window.isDestroyed()) return
    this.presenting = true
    try {
      const native = await readNativeScores(join(this.directory, 'native-scoreboard.tsv'))
      if (this.stopped || this.window.isDestroyed()) return
      if (this.lastSnapshot && native)
        this.lastSnapshot = mergeNativeScores(this.lastSnapshot, native)
      const username = getSessionUsername() ?? ''
      const signature = JSON.stringify([username, this.lastSnapshot])
      if (signature !== this.lastPresentation) {
        this.window.webContents.send('scoreboard-self', username)
        this.window.webContents.send('scoreboard-snapshot', this.lastSnapshot)
        this.lastPresentation = signature
      }
      this.window.webContents.invalidate()
    } finally {
      this.presenting = false
    }
  }

  private async refresh(): Promise<void> {
    if (this.stopped || this.busy) return
    this.busy = true
    try {
      const token = getSessionToken()
      if (!token) {
        this.lastSnapshot = null
        this.feedAvailable = false
        this.transportFeed = null
        this.transportRevision = null
        await unlink(this.feedPath).catch(() => undefined)
        throw new Error('No session')
      }
      const native = await readNativeScores(join(this.directory, 'native-scoreboard.tsv'))
      const nativeMode =
        !this.forceFullFeed &&
        !!(
          this.lastSnapshot?.players.length &&
          native &&
          this.lastSnapshot.players.every((player) =>
            native.some((row) => row.id === player.id && row.name === player.name)
          )
        )
      if (nativeMode !== this.transportMode) this.transportRevision = null
      this.transportMode = nativeMode
      const response = await fetch(
        new URL(`/matches/${encodeURIComponent(this.matchId)}/live-scoreboard`, this.apiUrl),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(nativeMode ? { 'X-Scoreboard-Mode': 'native-v1' } : {}),
            ...(this.transportRevision ? { 'X-Scoreboard-Base': this.transportRevision } : {})
          },
          redirect: 'error',
          signal: AbortSignal.any([this.requests.signal, AbortSignal.timeout(3000)])
        }
      )
      // Only an authenticated match member receives 410 for a terminal match.
      // Stop the HUD lifecycle instead of filing a false outage after shutdown.
      if (response.status === 410) {
        console.info('[Scoreboard] match ended; stopping live HUD', { matchId: this.matchId })
        this.stop()
        return
      }
      if (response.status === 401 || response.status === 403) {
        this.lastSnapshot = null
        this.feedAvailable = false
        this.transportFeed = null
        this.transportRevision = null
        await unlink(this.feedPath).catch(() => undefined)
      }
      if ((!response.ok && response.status !== 304) || response.status === 204)
        throw new Error(`Scoreboard unavailable (HTTP ${response.status})`)
      const revision = response.headers.get('x-scoreboard-revision')
      let feed: string | null
      if (response.status === 304) {
        if (!this.transportFeed || !this.transportRevision || revision !== this.transportRevision)
          throw new Error('Scoreboard baseline missing')
        feed = this.transportFeed
      } else {
        feed = await readBoundedFeed(response)
        if (
          response.headers
            .get('content-type')
            ?.startsWith('application/vnd.16c.scoreboard-delta+json')
        ) {
          if (!feed || !this.transportFeed || !this.transportRevision)
            throw new Error('Scoreboard baseline missing')
          feed = decodeScoreboardDelta(this.transportFeed, this.transportRevision, feed)
        }
      }
      if (!feed || !/^#16c-scoreboard-v(?:[2-9]|1[0-4])\t/.test(feed))
        throw new Error('Invalid scoreboard feed')
      if (
        revision &&
        (!/^[a-f0-9]{64}$/.test(revision) ||
          createHash('sha256').update(feed).digest('hex') !== revision)
      )
        throw new Error('Scoreboard revision mismatch')
      const snapshot = this.parseSnapshot(feed)
      if (!snapshot) throw new Error('Invalid scoreboard snapshot')
      const accoladeHeader = response.headers.get('x-round-accolade')
      // A missing header can be a transient server-file read during replacement.
      // The native HUD enforces its own six-second expiry on the last valid award.
      if (accoladeHeader && accoladeHeader.length <= 220) {
        const accolade = Buffer.from(accoladeHeader, 'base64').toString('utf8')
        const fields = accolade.trimEnd().split('\t')
        if (
          /^\d{1,2}\t[12]\t[1-8]\t\d{1,2}\t\d{1,5}\t[^\t\r\n]{1,31}\n$/.test(accolade) &&
          Number(fields[0]) <= snapshot.round &&
          accolade !== this.lastRoundAccolade
        ) {
          await writeLiveSessionFile(join(this.directory, 'round-accolade.state'), accolade)
          this.lastRoundAccolade = accolade
          console.info('[Scoreboard] round accolade received', {
            matchId: this.matchId,
            round: Number(fields[0]),
            code: Number(fields[2])
          })
        }
      }
      const nativePayload = response.headers.get('x-scoreboard-mode') === 'native-v1'
      if (
        nativePayload &&
        !snapshot.players.every((player) =>
          native?.some((row) => row.id === player.id && row.name === player.name)
        )
      ) {
        this.forceFullFeed = true
        throw new Error('Native scoreboard roster changed; requesting full snapshot')
      }
      this.forceFullFeed = false
      if (this.stopped) return
      if (getSessionToken() !== token) {
        this.lastSnapshot = null
        this.feedAvailable = false
        this.transportFeed = null
        this.transportRevision = null
        await unlink(this.feedPath).catch(() => undefined)
        throw new Error('Scoreboard session changed')
      }
      await writeLiveSessionFile(this.feedPath, feed)
      this.transportFeed = feed
      this.transportRevision = revision
      // Missing native rows retain their last displayed values until a full resync.
      const display =
        nativePayload && this.lastSnapshot
          ? mergeNativeScores(snapshot, this.lastSnapshot.players)
          : snapshot
      this.lastSnapshot = native ? mergeNativeScores(display, native) : display
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
      this.transportRevision = null
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
        console.warn('[Scoreboard] live match feed unavailable; retaining last scoreboard', {
          matchId: this.matchId,
          error: error instanceof Error ? error.message : String(error)
        })
        this.reportedUnavailable = true
      }
      this.feedAvailable = false
      // Retain the last match-scoped file without refreshing its timestamp.
      // Native live features still expire; Tab can display the previous board.
      await this.syncKillCards(null)
    } finally {
      this.busy = false
      await this.present()
      if (!this.stopped && this.lastKillCardState !== null && !this.cardsWindow.isDestroyed())
        this.cardsWindow.webContents.invalidate()
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
    if (this.presentationTimer) clearInterval(this.presentationTimer)
    this.presentationTimer = null
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
