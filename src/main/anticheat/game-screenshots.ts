import { desktopCapturer } from 'electron'
import { getSessionToken } from '../auth'
import { API_BASE_URL, LOCAL_DEVELOPMENT } from '../config'

const INTERVAL_MS = 60_000
const MAX_PNG_BYTES = 2 * 1024 * 1024
const GAME_WINDOW = /^(Counter-Strike(?: 1\.6)?|Half-Life)$/i

/** Client frames are untrusted review evidence; capture failure never changes a verdict. */
export class GameScreenshotCollector {
  private timer: NodeJS.Timeout | null = null
  private busy = false

  constructor(private readonly matchId: string, private readonly attached: () => boolean) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.attached()) return
    const token = getSessionToken()
    if (!token) return
    const base = new URL(API_BASE_URL)
    if (base.protocol !== 'https:' && !(LOCAL_DEVELOPMENT && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) return
    this.busy = true
    try {
      const signal = AbortSignal.timeout(10_000)
      const policy = await fetch(new URL(`/auth/anti-cheat/screenshot-policy?matchId=${encodeURIComponent(this.matchId)}`, base), {
        headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal
      })
      if (!policy.ok || !(await policy.json() as { enabled?: boolean }).enabled) return
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1280, height: 720 }, fetchWindowIcons: false })
      const source = sources.find((item) => GAME_WINDOW.test(item.name) && !item.thumbnail.isEmpty())
      if (!source) return
      const png = source.thumbnail.toPNG()
      if (!png.length || png.length > MAX_PNG_BYTES) return
      await fetch(new URL('/auth/anti-cheat/screenshots', base), {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: this.matchId, pngBase64: png.toString('base64') }),
        redirect: 'error', signal: AbortSignal.timeout(15_000)
      })
    } catch {
      // A missing window, denied capture, or failed upload is not a cheating signal.
    } finally {
      this.busy = false
    }
  }
}
