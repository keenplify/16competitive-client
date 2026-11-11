import { app, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { CS13_DOWNLOAD_URL, LEGACY_GAME_CHANNELS } from '../../shared/legacy-game'
import { matchmakingConnection } from '../matchmaking'
import { cs13Adapter, LegacyInstallationError } from './adapters/cs13'
import { launchOrdinaryCounterStrike } from './cs16-launcher'
import { LegacyGameService } from './legacy-game-service'

export function registerLegacyGameIpc(): void {
  const service = new LegacyGameService({
    settingsPath: join(app.getPath('userData'), 'cs13-installation.json'),
    platform: process.platform,
    isBusy: () => matchmakingConnection.isBusyForDemo(),
    chooseFolder: async () => {
      // Technical version identifier only; renderer supplies the translated label.
      const result = await dialog.showOpenDialog({
        title: 'Counter-Strike 1.3',
        properties: ['openDirectory']
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    launch: (plan) =>
      launchOrdinaryCounterStrike(async () => {
        if (matchmakingConnection.isBusyForDemo()) throw new LegacyInstallationError('busy')
        // Revalidate after waiting for the shared launch/cleanup queue.
        const mod = plan.args.at(-1)
        if (mod !== 'cstrike' && mod !== 'cstrk13')
          throw new LegacyInstallationError('invalidInstallation')
        const installation = await cs13Adapter.validateInstallation(
          join(plan.cwd, mod),
          process.platform
        )
        const fresh = cs13Adapter.buildMenuLaunchPlan(installation)
        if (matchmakingConnection.isBusyForDemo()) throw new LegacyInstallationError('busy')
        const child = spawn(fresh.executable, fresh.args, {
          cwd: fresh.cwd,
          shell: false,
          detached: true,
          stdio: 'ignore',
          // Launch tickets and session variables must not cross into an ordinary game.
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) =>
                key !== 'LD_PRELOAD' &&
                !/^(?:PAPAMO_|SIXTEEN|CS16|COMPETITIVE|STEAM_APP|SteamApp|SteamGame)/.test(key)
            )
          )
        })
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', reject)
        })
        child.unref()
        console.info('[LegacyGame] Ordinary Counter-Strike 1.3 menu launched', {
          runtime: installation.runtime,
          modDirectory: installation.modDirectory
        })
      })
  })
  ipcMain.handle(LEGACY_GAME_CHANNELS.get, () => service.get())
  ipcMain.handle(LEGACY_GAME_CHANNELS.choose, () => service.choose())
  ipcMain.handle(LEGACY_GAME_CHANNELS.launch, () => service.launch())
  ipcMain.handle(LEGACY_GAME_CHANNELS.openDownload, async () => {
    try {
      await shell.openExternal(CS13_DOWNLOAD_URL)
      return { ok: true, value: null }
    } catch {
      return { ok: false, error: 'downloadFailed' }
    }
  })
}
