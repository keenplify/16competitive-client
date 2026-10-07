import { desktopCapturer } from 'electron'
import { getSessionToken } from '../auth'
import { API_BASE_URL, LOCAL_DEVELOPMENT } from '../config'
import { captureWaylandScreenshot } from './wayland-screenshot'

const INTERVAL_MS = 60_000
const MAX_PNG_BYTES = 2 * 1024 * 1024
const GAME_WINDOW = /^(Counter-Strike(?: 1\.6)?|Half-Life)$/i

/** Client frames are untrusted review evidence; capture failure never changes a verdict. */
export class GameScreenshotCollector {
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private stopped = false
  private taskAbort: AbortController | null = null

  constructor(
    private readonly matchId: string,
    private readonly attached: () => boolean,
    private readonly apiUrl: () => string = () => API_BASE_URL
  ) {}

  start(): void {
    if (this.timer || this.stopped) return
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS)
    this.timer.unref()
  }

  stop(): void {
    this.stopped = true
    this.taskAbort?.abort()
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (this.busy || this.stopped || !this.attached()) return
    const token = getSessionToken()
    if (!token) return
    const base = new URL(this.apiUrl())
    if (
      base.protocol !== 'https:' &&
      !(LOCAL_DEVELOPMENT && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
    )
      return
    this.busy = true
    this.taskAbort = new AbortController()
    try {
      const signal = AbortSignal.any([this.taskAbort.signal, AbortSignal.timeout(10_000)])
      const policy = await fetch(
        new URL(
          `/auth/anti-cheat/screenshot-policy?matchId=${encodeURIComponent(this.matchId)}`,
          base
        ),
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal
        }
      )
      if (!policy.ok || !((await policy.json()) as { enabled?: boolean }).enabled) return
      if (this.stopped || !this.attached()) return
      const png =
        process.platform === 'linux' && process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland'
          ? await captureWaylandScreenshot(this.taskAbort.signal)
          : await this.captureGameWindow()
      if (!png || this.stopped || !this.attached()) return
      if (!png.length || png.length > MAX_PNG_BYTES) return
      await fetch(new URL('/auth/anti-cheat/screenshots', base), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: this.matchId, pngBase64: png.toString('base64') }),
        redirect: 'error',
        signal: AbortSignal.any([this.taskAbort.signal, AbortSignal.timeout(15_000)])
      })
    } catch {
      // A missing window, denied capture, or failed upload is not a cheating signal.
    } finally {
      this.taskAbort = null
      this.busy = false
    }
  }

  private async captureGameWindow(): Promise<Buffer | null> {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1280, height: 720 },
      fetchWindowIcons: false
    })
    return (
      sources
        .find((item) => GAME_WINDOW.test(item.name) && !item.thumbnail.isEmpty())
        ?.thumbnail.toPNG() ?? null
    )
  }
}
