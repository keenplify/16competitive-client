import { BrowserWindow, session } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getSessionToken } from '../auth'
import {
  parsePartnerUiCatalog,
  parsePartnerUiDisplay,
  partnerUiDocument,
  parsePartnerUiViewport,
  type PartnerUiViewport,
  type PartnerUiPage
} from '../../shared/partner-ui'
import { encodeHudFrame } from './hud-frame'
import { writeLiveSessionFile } from './live-session-file'

export async function readUiResponse(response: Response, limit: number): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Partner UI request failed')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('Partner UI response exceeds limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export async function cachePartnerUi(
  api: URL,
  serverId: string,
  directory: string
): Promise<PartnerUiPage[]> {
  const token = getSessionToken()
  if (!token) return []
  const response = await fetch(new URL(`/partners/servers/${serverId}/ui/catalog`, api), {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  })
  if (response.status === 403 || response.status === 404) return []
  const pages = parsePartnerUiCatalog(await readUiResponse(response, 4 * 1024 * 1024))
  await mkdir(directory, { recursive: true })
  if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink())
    throw new Error('Invalid UI cache')
  for (const page of pages) {
    if (createHash('sha256').update(page.html).digest('hex') !== page.sha256)
      throw new Error('UI page checksum mismatch')
    const path = join(directory, page.sha256 + '.html')
    const entry = await lstat(path).catch(() => null)
    if (entry && (!entry.isFile() || entry.isSymbolicLink()))
      throw new Error('Invalid UI cache file')
    const bytes = entry && entry.size <= 65536 ? await readFile(path) : null
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== page.sha256)
      await writeLiveSessionFile(path, page.html)
  }
  // Retain the current catalog and at most 64 historical pages (~4 MiB).
  const current = new Set(pages.map((p) => p.sha256 + '.html'))
  const old = await Promise.all(
    (await readdir(directory))
      .filter((name) => /^[a-f0-9]{64}\.html$/.test(name) && !current.has(name))
      .map(async (name) => ({ name, meta: await lstat(join(directory, name)) }))
  )
  old.sort((a, b) => b.meta.mtimeMs - a.meta.mtimeMs)
  for (const entry of old.slice(64))
    if (entry.meta.isFile() && !entry.meta.isSymbolicLink()) await rm(join(directory, entry.name))
  return pages
}
export function createPartnerUiWindow(): BrowserWindow {
  const isolated = session.fromPartition('16c-ui-' + randomUUID(), { cache: false })
  isolated.setPermissionRequestHandler((_web, _permission, callback) => callback(false))
  isolated.setPermissionCheckHandler(() => false)
  isolated.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !details.url.startsWith('data:') && details.url !== 'about:blank' })
  )
  isolated.on('will-download', (event) => event.preventDefault())
  const window = new BrowserWindow({
    width: 640,
    height: 360,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
      session: isolated,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true,
      webgl: false,
      spellcheck: false,
      devTools: false
    }
  })
  window.webContents.setAudioMuted(true)
  window.webContents.setFrameRate(4)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-redirect', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.stopPainting()
  return window
}

export class PartnerHtmlRenderer {
  private timer: ReturnType<typeof setInterval> | null = null
  private stopped = false
  private busy = false
  private generation = 0
  private visibleUntil = 0
  private page: PartnerUiPage | null = null
  private lastPng: Buffer | null = null
  private writing: Promise<void> = Promise.resolve()
  private revision = ''
  private loading = false
  private viewport: PartnerUiViewport | null = null
  private readonly token = getSessionToken()
  constructor(
    private readonly window: BrowserWindow,
    private readonly directory: string,
    private readonly api: URL,
    private readonly serverId: string,
    private readonly connectionId: string,
    private readonly pages: PartnerUiPage[]
  ) {
    window.webContents.on('paint', (_event, _dirty, image) => {
      if (this.stopped || !this.page || this.loading || Date.now() >= this.visibleUntil) return
      if (!this.viewport) return
      const png = encodeHudFrame(image, this.viewport.width, this.viewport.height, 8 * 1024 * 1024)
      if (png) this.lastPng = png
    })
  }
  start(): void {
    this.timer = setInterval(() => {
      if (Date.now() >= this.visibleUntil && this.page) void this.hide()
      if (!this.busy) void this.poll()
    }, 500)
    this.timer.unref()
    void this.poll()
  }
  private async hide(): Promise<void> {
    this.generation++
    this.page = null
    this.lastPng = null
    this.revision = ''
    this.visibleUntil = 0
    if (!this.window.isDestroyed()) {
      this.window.webContents.stopPainting()
      if (this.loading) this.window.webContents.forcefullyCrashRenderer()
      else void this.window.loadURL('about:blank').catch(() => undefined)
    }
    this.loading = false
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        await rm(join(this.directory, 'partner-ui.state'), { force: true })
        await rm(join(this.directory, 'overlay.png'), { force: true })
      })
    await this.writing
  }
  private async evaluate(script: string): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.window.webContents.executeJavaScript(script),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            if (!this.window.isDestroyed()) this.window.webContents.forcefullyCrashRenderer()
            reject(new Error('Partner HTML script timed out'))
          }, 1500)
        })
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
  private async poll(): Promise<void> {
    this.busy = true
    const generation = this.generation
    try {
      if (!this.token || getSessionToken() !== this.token) {
        await this.hide()
        return
      }
      const viewportPath = join(this.directory, 'partner-ui.viewport')
      const meta = await lstat(viewportPath).catch(() => null)
      const viewport =
        meta?.isFile() && !meta.isSymbolicLink() && meta.size <= 80
          ? parsePartnerUiViewport(await readFile(viewportPath, 'utf8'))
          : null
      if (!viewport) {
        await this.hide()
        return
      }
      const resized =
        !this.viewport ||
        viewport.width !== this.viewport.width ||
        viewport.height !== this.viewport.height
      this.viewport = viewport
      if (resized) {
        this.lastPng = null
        this.window.setContentSize(viewport.width, viewport.height)
        this.window.webContents.setZoomFactor(1)
      }
      const response = await fetch(
        new URL(
          `/partners/servers/${this.serverId}/ui/state?connectionId=${this.connectionId}`,
          this.api
        ),
        {
          headers: { authorization: `Bearer ${this.token}` },
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(2500)
        }
      )
      const state = parsePartnerUiDisplay(await readUiResponse(response, 32768))
      if (state && state.connectionId !== this.connectionId)
        throw new Error('UI belongs to another connection')
      if (this.stopped || generation !== this.generation) return
      const page = state?.key
        ? this.pages.find((p) => p.key === state.key && p.sha256 === state.sha256)
        : null
      if (!state || !page) {
        await this.hide()
        return
      }
      const until = Date.parse(state.expiresAt)
      if (this.page !== page) {
        await this.hide()
        if (this.stopped) return
        this.page = page
        this.visibleUntil = until
        this.loading = true
        await this.window.loadURL(
          'data:text/html;charset=utf-8;base64,' +
            Buffer.from(partnerUiDocument(page.html)).toString('base64')
        )
        this.loading = false
        if (this.stopped || this.page !== page || Date.now() >= until) return
      }
      this.visibleUntil = until
      const viewportEvent =
        'window.dispatchEvent(new CustomEvent("16c-ui-viewport",{detail:' +
        JSON.stringify(viewport) +
        '}))'
      if (resized || !this.revision) {
        await this.evaluate(viewportEvent)
        this.window.webContents.invalidate()
      }
      const revision = state.connectionId + ':' + state.sequence
      if (revision !== this.revision) {
        this.revision = revision
        // JSON is serialized as a JS string, then parsed inside the sandbox.
        // Neither the data nor HTML receives a preload or any launcher IPC.
        const updateGeneration = this.generation
        void this.evaluate(
          'window.dispatchEvent(new CustomEvent("16c-ui-data",{detail:JSON.parse(' +
            JSON.stringify(state.data) +
            ')}))'
        ).catch(() => {
          if (updateGeneration === this.generation) void this.hide()
        })
        this.window.webContents.startPainting()
        this.window.webContents.invalidate()
      }
      const png = this.lastPng
      if (png) {
        const stamp = Math.min(until, Date.now() + 2000)
        this.writing = this.writing
          .catch(() => undefined)
          .then(async () => {
            if (this.stopped || this.page !== page || Date.now() >= stamp) return
            await writeLiveSessionFile(join(this.directory, 'overlay.png'), png)
            await writeLiveSessionFile(join(this.directory, 'partner-ui.state'), `v1\n${stamp}\n`)
          })
        await this.writing
      }
    } catch (error) {
      if (!this.stopped) {
        await this.hide()
        console.warn(
          '[PartnerUI] display unavailable',
          error instanceof Error ? error.message : 'request failed'
        )
      }
    } finally {
      this.busy = false
    }
  }
  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.hide()
  }
}
