import { Tray, Menu, type BrowserWindow } from 'electron'
import type { MatchmakingMode } from '../shared/matchmaking'
import { matchNotificationCopy, queuedModeLabel } from '../shared/match-notification-copy'

interface QueueTrayOptions {
  icon: string
  name?: string
  getQueuedMode: () => MatchmakingMode | null
  show: () => void
  quit: () => void
  locale: () => string
}

export class QueueTrayController {
  private tray: Tray | null = null
  constructor(private readonly options: QueueTrayOptions) {}

  hideWhileQueued(window: BrowserWindow | null): boolean {
    if (!window || !this.options.getQueuedMode()) return false
    if (!this.tray) {
      // Create the tray before hiding: a desktop without a tray must retain its window.
      try {
        this.tray = new Tray(this.options.icon)
        this.tray.setToolTip(this.options.name ?? '1.6 Competitive')
        this.tray.on('click', this.options.show)
        this.tray.on('double-click', this.options.show)
        if (process.platform === 'linux') {
          // GNOME AppIndicator and KDE StatusNotifier hosts consume a registered
          // D-Bus menu; Electron's right-click event is not supported on Linux. Keep this
          // menu action-only so it cannot show stale queue state while hidden.
          const copy = matchNotificationCopy(this.options.locale())
          this.tray.setContextMenu(
            Menu.buildFromTemplate([
              { label: copy.open, click: this.options.show },
              { type: 'separator' },
              { label: copy.quit, click: this.options.quit }
            ])
          )
        } else {
          this.tray.on('right-click', () => {
            const language = this.options.locale()
            const copy = matchNotificationCopy(language)
            const mode = this.options.getQueuedMode()
            this.tray?.popUpContextMenu(
              Menu.buildFromTemplate([
                { label: copy.open, click: this.options.show },
                ...(mode
                  ? [
                      {
                        label: `${copy.queueing} · ${queuedModeLabel(language, mode)}`,
                        enabled: false
                      }
                    ]
                  : []),
                { type: 'separator' },
                { label: copy.quit, click: this.options.quit }
              ])
            )
          })
        }
      } catch (error) {
        this.tray?.destroy()
        this.tray = null
        console.error('[QueueTray] could not create tray', error)
        this.options.show()
        // Prevent close rather than leave a background queue with no usable entry point.
        return true
      }
    }
    window.hide()
    return true
  }

  setIdentity(name: string, icon: string): void {
    this.options.name = name
    this.options.icon = icon
    this.tray?.setToolTip(name)
    this.tray?.setImage(icon)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
