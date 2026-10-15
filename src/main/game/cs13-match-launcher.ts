import { createCs13AuthFile, cs13AuthContents } from './cs13-auth-file'
import { createHash } from 'node:crypto'
import { app, screen } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { access, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import type { MatchmakingServerMessage } from '../../shared/matchmaking'
import { cs13Adapter, cs13ConnectionArgs } from './adapters/cs13'
import { lookup } from 'node:dns/promises'
import { LegacyGameService } from './legacy-game-service'
import {
  launchOrdinaryCounterStrike,
  closeLinuxCounterStrikeProcesses,
  closeWindowsCounterStrikeProcesses
} from './cs16-launcher'
import { ScoreboardOverlaySession } from './scoreboard-overlay'
import { WindowsCosmeticInstallation } from './windows-cosmetic-installation'
import { getGameSettings, getSavedVoicePttKey } from './game-settings'
import { prepareVoicePtt, type VoicePttSession, type VoiceTalkChannel } from './voice-ptt'
import { CUSTOM_HUD_ENABLED } from '../../shared/custom-hud'
import { registerManagedAdapterShutdown } from './managed-session-registry'
import { prepareCs13MatchInstallation } from './cs13-match-installation'
import { setGameConsoleDirectory } from './game-console-logs'
import { ensureSharedModelDirectory } from './shared-model-directory'
import { resolveGameResolution } from '../../shared/game-display'
import { prepareCs13Controls } from './cs13-controls'

let running: {
  matchId: string
  process: ChildProcess
  root: string
  executable: string
  overlay: ScoreboardOverlaySession | null
  voice: VoicePttSession | null
  cleanupAuth: () => Promise<void>
} | null = null
let cleanup: Promise<void> = Promise.resolve()

export async function shutdownCs13Game(matchId?: string): Promise<void> {
  const active = running
  if (!active || (matchId && active.matchId !== matchId)) return cleanup
  running = null
  active.voice?.stop()
  active.overlay?.stop()
  cleanup = (async () => {
    if (process.platform === 'linux') await closeLinuxCounterStrikeProcesses(active.root)
    if (process.platform === 'win32') await closeWindowsCounterStrikeProcesses(active.executable)
    try {
      if (active.process.exitCode === null && active.process.signalCode === null) {
        if (active.process.pid && process.platform === 'linux')
          process.kill(-active.process.pid, 'SIGTERM')
        else active.process.kill('SIGTERM')
      }
    } catch {
      /* exited */
    }
    await active.cleanupAuth()
    await ScoreboardOverlaySession.waitForCleanup()
  })()
  return cleanup
}
registerManagedAdapterShutdown(shutdownCs13Game)

export async function launchCs13Match(
  connection: Extract<MatchmakingServerMessage, { type: 'match_connect' }>,
  onExit: (code: number | null, signal: string | null) => void,
  isCurrent: () => boolean,
  apiUrl?: string,
  onVoicePtt: (active: boolean, channel: VoiceTalkChannel) => void = () => undefined,
  forceRestart = false
): Promise<void> {
  cs13ConnectionArgs(connection)
  if (!isCurrent()) return
  // Reconnects end the old lease and mint a fresh, fixed-lifetime ticket.
  if (running?.matchId === connection.matchId) {
    if (!forceRestart) return
    await shutdownCs13Game(connection.matchId)
  }
  await launchOrdinaryCounterStrike(async () => {
    if (!isCurrent()) return
    if (running && running.process.exitCode === null && running.process.signalCode === null) {
      if (running.matchId === connection.matchId) return
      throw new Error('legacy.error.busy')
    }
    const profile = await new LegacyGameService({
      settingsPath: join(app.getPath('userData'), 'cs13-installation.json'),
      platform: process.platform,
      chooseFolder: async () => null,
      isBusy: () => false,
      launch: async () => {}
    }).get()
    if (!profile.ok || !profile.value.installation)
      throw new Error(
        !profile.ok
          ? 'legacy.error.settingsFailed'
          : profile.value.folderPath
            ? 'legacy.error.invalidInstallation'
            : 'legacy.error.installationRequired'
      )
    let installation = profile.value.installation
    await cleanup
    await WindowsCosmeticInstallation.restorePreviousInstall(
      installation.folderPath,
      installation.modDirectory,
      installation.runtime
    )
    installation = await prepareCs13MatchInstallation(installation, process.platform)
    await ensureSharedModelDirectory(
      installation.gameDirectory,
      join(app.getPath('userData'), 'game-assets', 'models', '16competitive')
    )
    await WindowsCosmeticInstallation.restorePreviousInstall(
      installation.folderPath,
      installation.modDirectory,
      installation.runtime
    )
    const gamescope =
      process.platform === 'linux' &&
      installation.runtime === 'wine' &&
      (await access('/usr/bin/gamescope', constants.X_OK)
        .then(() => true)
        .catch(() => false))
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const settings = await getGameSettings(true)
    const plan = cs13Adapter.buildMenuLaunchPlan(installation, {
      resolution: resolveGameResolution(
        settings.display,
        settings.currentDisplayResolution,
        'cs13'
      ),
      ...(gamescope
        ? { wineDisplay: { gamescopeExecutable: '/usr/bin/gamescope', ...display.size } }
        : {})
    })
    if (!isCurrent()) return
    const { address } = await lookup(connection.host, { family: 4 })
    const connectionArgs = cs13ConnectionArgs({ ...connection, host: address })
    if (!isCurrent()) return
    const controls = await prepareCs13Controls(installation.gameDirectory)
    let removeSessionAuth: () => Promise<void>
    try {
      removeSessionAuth = await createCs13AuthFile(
        installation.gameDirectory,
        connection,
        controls.applyName
      )
    } catch (error) {
      await controls.cleanup()
      throw error
    }
    const removeAuthFile = async (): Promise<void> => {
      try {
        await controls.cleanup()
      } finally {
        await removeSessionAuth()
      }
    }
    if (!isCurrent()) {
      await removeAuthFile()
      return
    }
    let overlay: ScoreboardOverlaySession | null = null
    let voice: VoicePttSession | null = null
    try {
      if (
        CUSTOM_HUD_ENABLED &&
        settings.nextClientIntegrationEnabled &&
        (process.platform === 'win32' || installation.runtime === 'wine')
      ) {
        const auth = cs13AuthContents(connection, controls.applyName)
        try {
          overlay = await ScoreboardOverlaySession.start(
            connection.matchId,
            apiUrl,
            installation.folderPath,
            false,
            `${address}:${connection.port}`,
            async () => {
              // The recovery worker owns the replacement stock process. Release
              // this match before acknowledging its restart, including late events.
              const active = running
              if (active?.matchId === connection.matchId) {
                active.voice?.stop()
                running = null
              }
              await removeAuthFile()
              onExit(0, null)
            },
            {
              gameDirectory: installation.modDirectory,
              runtime: installation.runtime,
              authFile: {
                name: auth.name,
                sha256: createHash('sha256').update(auth.contents).digest('hex')
              }
            }
          )
          if (overlay) {
            voice = prepareVoicePtt(onVoicePtt, await getSavedVoicePttKey())
            await voice.attachNative(overlay.directory)
            await writeFile(
              join(overlay.directory, 'player-ping.key'),
              `${settings.playerPingKey}\n`,
              {
                encoding: 'ascii',
                mode: 0o600
              }
            )
          }
        } catch (error) {
          voice?.stop()
          voice = null
          overlay?.stop()
          await ScoreboardOverlaySession.waitForCleanup()
          overlay = null
          await WindowsCosmeticInstallation.restorePreviousInstall(
            installation.folderPath,
            installation.modDirectory,
            installation.runtime
          )
          console.warn('[CS13] Native enhancements unavailable; original client restored', error)
        }
      }
      if (!isCurrent()) {
        voice?.stop()
        overlay?.stop()
        await removeAuthFile()
        await ScoreboardOverlaySession.waitForCleanup()
        return
      }
      setGameConsoleDirectory(installation.folderPath, installation.modDirectory)
      console.info('[CS13] Launching match', {
        matchId: connection.matchId,
        modDirectory: installation.modDirectory,
        runtime: installation.runtime,
        enhancements: overlay !== null
      })
      const child = spawn(
        plan.executable,
        [...plan.args, '-console', '-condebug', '+exec', controls.probeName, ...connectionArgs],
        {
          cwd: plan.cwd,
          shell: false,
          detached: true,
          stdio: 'ignore',
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) =>
                key !== 'LD_PRELOAD' &&
                !/^(?:PAPAMO_|SIXTEEN|CS16|COMPETITIVE|STEAM_APP|SteamApp|SteamGame)/.test(key)
            )
          )
        }
      )
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      running = {
        matchId: connection.matchId,
        process: child,
        root: installation.folderPath,
        executable: installation.executablePath,
        overlay,
        voice,
        cleanupAuth: removeAuthFile
      }
      controls.start()
      child.once('exit', (code, signal) => {
        console.info('[CS13] Game process exited', { matchId: connection.matchId, code, signal })
        if (running?.process !== child) return
        const active = running
        running = null
        active.voice?.stop()
        active.overlay?.stop()
        cleanup = (async () => {
          await removeAuthFile()
          await ScoreboardOverlaySession.waitForCleanup()
        })()
        void cleanup.catch((error: unknown) =>
          console.error('[CS13] Session cleanup failed', error)
        )
        onExit(code, signal)
      })
      child.unref()
    } catch (error) {
      voice?.stop()
      overlay?.stop()
      await removeAuthFile()
      await ScoreboardOverlaySession.waitForCleanup()
      throw error
    }
  }).catch((error: unknown) => {
    if (
      error instanceof Error &&
      [
        'legacy.error.installationRequired',
        'legacy.error.invalidInstallation',
        'legacy.error.settingsFailed',
        'legacy.error.busy'
      ].includes(error.message)
    )
      throw error
    console.error('[CS13] Match launch failed', {
      code:
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'LAUNCH_FAILED'
    })
    throw new Error('legacy.error.launchFailed')
  })
}
