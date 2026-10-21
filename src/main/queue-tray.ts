import { Tray, Menu, type BrowserWindow } from 'electron'
import type { MatchmakingMode } from '../shared/matchmaking'
import { matchNotificationCopy, queuedModeLabel } from '../shared/match-notification-copy'

interface QueueTrayOptions {
  icon: string
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
        this.tray.setToolTip('1.6 Competitive')
        this.tray.on('click', this.options.show)
        this.tray.on('double-click', this.options.show)
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

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
