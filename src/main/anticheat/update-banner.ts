import { app, type BrowserWindow } from 'electron'
import type { AppUpdateStatus } from '../../shared/updater'
import { detectLanguage } from '../../shared/language-detection'
import { guardUpdateTranslations, type GuardLanguage } from '../../shared/guard-update-translations'
import { checkForAppUpdates, getAppUpdateStatus, onAppUpdateStatus } from '../updater'
import { showAntiCheatStartupSplash } from './startup-splash'

/** Owns update presentation, including startup before the launcher is visible. */
export class AntiCheatUpdateBanner {
  private splash: BrowserWindow | null
  private opening: Promise<void> | null = null
  private starting = true
  private rendering = false
  private renderPending = false
  private presentationFailed: (() => void) | null = null
  private latest: AppUpdateStatus = { state: 'idle' }
  private hiddenLauncher: BrowserWindow | null = null
  private language: GuardLanguage = detectLanguage(
    app.getPreferredSystemLanguages(),
    Object.keys(guardUpdateTranslations) as GuardLanguage[],
    'en'
  )

  constructor(
    splash: BrowserWindow | null,
    private readonly getLauncher: () => BrowserWindow | undefined
  ) {
    this.splash = splash
    // The startup document was created before this controller existed.
    splash?.webContents.on('will-navigate', (event, url) => {
      event.preventDefault()
      if (url === 'papamo-guard://retry') this.action('retry')
      if (url === 'papamo-guard://exit') this.action('exit')
    })
    const unsubscribe = onAppUpdateStatus((status) => {
      this.latest = status
      void this.render().catch((error: unknown) => {
        console.warn('[Updater] Could not present update banner', error)
        // Preserve the renderer fallback if the native banner fails.
        this.presentationFailed?.()
        this.close()
      })
    })
    app.once('before-quit', () => {
      unsubscribe()
      if (this.splash && !this.splash.isDestroyed()) this.splash.destroy()
      this.splash = null
    })
  }

  async checkBeforeStartup(): Promise<void> {
    // A missing banner must leave the existing renderer recovery UI reachable.
    if (!this.splash) {
      checkForAppUpdates()
      return
    }
    await new Promise<void>((resolve) => {
      const finish = (): void => {
        clearTimeout(timeout)
        unsubscribe()
        this.presentationFailed = null
        resolve()
      }
      const unsubscribe = onAppUpdateStatus((status) => {
        if (status.state === 'idle' || (status.state === 'error' && !status.requiredVersion))
          finish()
      })
      // An unreachable release provider must not indefinitely prevent startup.
      // Known downloads/errors remain in the banner until retry or process exit.
      const timeout = setTimeout(() => {
        const status = getAppUpdateStatus()
        if (
          status.state === 'idle' ||
          status.state === 'checking' ||
          (status.state === 'error' && !status.requiredVersion)
        )
          finish()
      }, 15_000)
      this.presentationFailed = finish
      checkForAppUpdates()
      if (getAppUpdateStatus().state === 'idle') finish() // Development/non-AppImage installations.
    })
  }

  isPresenting(): boolean {
    return Boolean(
      this.splash &&
      !this.splash.isDestroyed() &&
      this.latest.state !== 'idle' &&
      !(this.latest.state === 'error' && !this.latest.requiredVersion)
    )
  }

  launcherReady(): void {
    if (!this.isPresenting()) return
    const launcher = this.getLauncher()
    if (launcher && !launcher.isDestroyed()) {
      this.hiddenLauncher = launcher
      launcher.hide()
    }
  }

  finishStartup(): void {
    this.starting = false
    this.close()
  }

  private action(action: 'retry' | 'exit'): void {
    if (this.latest.state !== 'error' || !this.latest.requiredVersion) return
    if (action === 'exit') app.quit()
    else checkForAppUpdates()
  }

  private close(): void {
    // At startup create the launcher first, so closing the last splash cannot quit Electron.
    if (this.starting) return
    if (this.hiddenLauncher && !this.hiddenLauncher.isDestroyed()) this.hiddenLauncher.show()
    this.hiddenLauncher = null
    if (this.splash && !this.splash.isDestroyed()) this.splash.destroy()
    this.splash = null
  }

  private async render(): Promise<void> {
    this.renderPending = true
    if (this.rendering) return
    this.rendering = true
    try {
      while (this.renderPending) {
        this.renderPending = false
        await this.present()
      }
    } finally {
      this.rendering = false
    }
  }

  private async present(): Promise<void> {
    const status = this.latest
    if (status.state === 'idle' || (status.state === 'error' && !status.requiredVersion)) {
      this.close()
      return
    }
    if (!this.splash || this.splash.isDestroyed()) {
      this.opening ??= showAntiCheatStartupSplash((action) => this.action(action), this.language)
        .then((splash) => {
          this.splash = splash
        })
        .finally(() => {
          this.opening = null
        })
      await this.opening
    }
    const splash = this.splash
    if (!splash || splash.isDestroyed()) return
    let current = this.latest // Downloads can advance while the window loads.
    if (current.state === 'idle' || (current.state === 'error' && !current.requiredVersion)) {
      this.close()
      return
    }
    const launcher = this.getLauncher()
    if (launcher && !launcher.isDestroyed()) {
      // Honor the renderer's saved language when an existing launcher is available.
      const saved: unknown = await launcher.webContents
        .executeJavaScript("localStorage.getItem('16competitive.language')")
        .catch(() => null)
      if (typeof saved === 'string' && Object.hasOwn(guardUpdateTranslations, saved))
        this.language = saved as GuardLanguage
      current = this.latest
      if (splash.isDestroyed()) return
      if (current.state === 'idle' || (current.state === 'error' && !current.requiredVersion)) {
        this.close()
        return
      }
      if (launcher.isDestroyed()) return
      if (launcher.isVisible()) {
        this.hiddenLauncher = launcher
        launcher.hide()
      }
    }
    const copy = guardUpdateTranslations[this.language]
    const message =
      current.state === 'checking'
        ? copy.checking
        : current.state === 'downloaded'
          ? copy.restarting
          : current.state === 'error'
            ? copy.failed
            : copy.downloading
    const percent =
      current.state === 'downloading'
        ? Math.max(0, Math.min(100, current.percent))
        : current.state === 'downloaded'
          ? 100
          : null
    const failed = current.state === 'error'
    await splash.webContents.executeJavaScript(`(() => {
      document.documentElement.lang = ${JSON.stringify(this.language)};
      document.getElementById('status-message').textContent = ${JSON.stringify(message)};
      document.getElementById('status-detail').textContent = ${JSON.stringify(failed ? '' : percent === null ? copy.anticheat : `${percent}%`)};
      const progress = document.getElementById('status-progress');
      progress.classList.toggle('determinate', ${percent !== null || failed});
      progress.style.width = ${JSON.stringify(percent === null ? (failed ? '0%' : '38%') : `${percent}%`)};
      document.getElementById('status-actions').hidden = ${!failed};
      document.querySelector('a[href="papamo-guard://retry"]').textContent = ${JSON.stringify(copy.retry)};
      document.querySelector('a[href="papamo-guard://exit"]').textContent = ${JSON.stringify(copy.exit)};
    })()`)
    splash.setIgnoreMouseEvents(!failed)
    splash.setFocusable(failed)
    if (failed) splash.show()
    else splash.showInactive()
  }
}
