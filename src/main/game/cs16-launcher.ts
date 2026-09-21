import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import {
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { getSavedCs16Executable, getSavedVoicePttKey } from './game-settings'
import { getSessionUsername } from '../auth'
import { resolveCs16LaunchTarget } from './cs16-installation'
import {
  ensureCompetitiveGameDirectory,
  ensureSteamAddonsDirectory
} from './competitive-game-directory'
import { prepareVoicePtt, type VoicePttSession } from './voice-ptt'
import { startAntiCheatSession, type AntiCheatSession } from '../anticheat/anti-cheat'
import { startGameWatchdog, stopGameWatchdog } from '../anticheat/game-watchdog'
import {
  prepareManagedSkinAudio,
  restoreManagedSkinAudio,
  startManagedSkinAudioConnectionGuard
} from './skin-audio-override'

const SAFE_HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/
const SAFE_PASSWORD = /^[A-Za-z0-9_-]{1,128}$/
const MATCH_IDENTITY_WAIT_FRAMES = 20
const RELAUNCH_SETTLE_MS = 500
const LINUX_HANDOFF_DISCOVERY_TIMEOUT_MS = 30_000
const LINUX_HANDOFF_POLL_MS = 1_000
// Counter-Strike 1.6 on Steam. Direct launches export these so the client can
// initialise the Steam API the same way Steam's own launch flags would.
const STEAM_COUNTER_STRIKE_APP_ID = '10'

interface MatchLaunchInput {
  matchId: string
  host: string
  port: number
  password: string
  joinToken: string
  forceRestart?: boolean
  onVoicePtt?: (active: boolean) => void
  onExit?: (event: { code: number | null; signal: string | null }) => void
}

let gameProcess: ChildProcess | null = null
let launchedMatchId: string | null = null
let launchedGameDirectory: string | null = null
let launchedExecutablePath: string | null = null
let launchedMatchConfigPath: string | null = null
let launchedMatchConfigGeneration = 0
let nextMatchConfigGeneration = 0
let gameProcessGeneration = 0
let linuxMonitorGeneration = 0
let launchQueue: Promise<void> = Promise.resolve()
let forcedLaunchInFlight: { matchId: string; promise: Promise<void> } | null = null
let steamExitWatchGeneration = 0
let activeVoicePttSession: { matchId: string; session: VoicePttSession } | null = null
let activeAntiCheatSession: { matchId: string; session: AntiCheatSession } | null = null

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

const finishVoicePttSession = async (matchId?: string): Promise<void> => {
  const active = activeVoicePttSession
  if (!active || (matchId && active.matchId !== matchId)) return
  activeVoicePttSession = null
  try {
    await active.session.restoreBindings()
  } catch (error) {
    console.warn('[VoicePTT] could not restore Counter-Strike voice settings', error)
  }
}

const stopAntiCheatSession = (session: AntiCheatSession, reason: string): void => {
  session.stop(reason)
  if (activeAntiCheatSession?.session === session) activeAntiCheatSession = null
}

const finishAntiCheatSession = (matchId?: string, reason = 'session-ended'): void => {
  const active = activeAntiCheatSession
  if (!active || (matchId && active.matchId !== matchId)) return
  activeAntiCheatSession = null
  active.session.stop(reason)
}

const clearMatchConfig = (generation?: number): void => {
  if (generation !== undefined && launchedMatchConfigGeneration !== generation) return
  const matchConfigPath = launchedMatchConfigPath
  launchedMatchConfigPath = null
  launchedMatchConfigGeneration = 0
  if (matchConfigPath) void unlink(matchConfigPath).catch(() => undefined)
}

// Direct launches run in their own process group, so terminating the group also
// stops the launcher script, any emulation wrapper and the game itself. Without
// that, killing the wrapper leaves Counter-Strike running on hosts where the
// game process is not directly observable (Proton, box64, FEX/microVM setups).
const terminateSpawnedGameProcess = (child: ChildProcess | null): void => {
  if (!child || child.pid === undefined) return
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
    return
  } catch {
    /* the child is not a process group leader */
  }
  try {
    child.kill('SIGTERM')
  } catch {
    /* the process already exited */
  }
}

// GoldSrc can be wrapped by a launcher script or an emulation layer (box64, FEX,
// Proton, microVM based setups) where `/proc/<pid>/exe` is the interpreter
// instead of the game. Comparing program names instead of raw path segments
// avoids matching unrelated paths such as a `/ssd/steam/` library folder.
const GOLD_SRC_PROCESS_PATTERN =
  /(?:^|[\s/\\])(?:hl\.sh|hl_linux|hl\.exe|hlds_run|hlds_linux)(?:$|[\s/\\])/i

// Program names that identify the running Steam client. Steam can be started as
// `steam`, `steam.sh` or `bin_steam.sh`, spawns `steamwebhelper` for its UI and
// may be wrapped by a compatibility container.
const STEAM_CLIENT_PROGRAMS = new Set([
  'steam',
  'steam.sh',
  'bin_steam.sh',
  'steamwebhelper',
  'steamwebhelper.sh'
])

const isSteamClientProgram = (value: string): boolean =>
  STEAM_CLIENT_PROGRAMS.has(basename(value.trim()).toLowerCase())

const commandLineMentionsSteamClient = (commandLine: string): boolean =>
  commandLine
    .split(' ')
    .filter(Boolean)
    .some((token) => isSteamClientProgram(token))

const readProcessCmdline = async (processId: number | string): Promise<string> => {
  const raw = await readFile(`/proc/${processId}/cmdline`).catch(() => null)
  if (!raw) return ''
  return raw.toString('utf8').split('\u0000').filter(Boolean).join(' ')
}

const readProcessExecutable = async (processId: number | string): Promise<string> =>
  readlink(`/proc/${processId}/exe`).catch(() => '')

const listProcessIds = async (): Promise<number[]> => {
  const entries = await readdir('/proc', { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .filter((pid) => pid !== process.pid)
}

const getLinuxCounterStrikeProcessIds = async (gameDirectory: string): Promise<number[]> => {
  const processIds = await listProcessIds()
  const matches = await Promise.all(
    processIds.map(async (pid) => {
      const [cwd, executable, cmdline] = await Promise.all([
        readlink(`/proc/${pid}/cwd`).catch(() => ''),
        readProcessExecutable(pid),
        readProcessCmdline(pid)
      ])
      if (cwd !== gameDirectory) return null
      if (basename(executable) === 'hl_linux') return pid
      // Wrapped or emulated clients report the interpreter as their executable,
      // so fall back to the command line before giving up on the process.
      return GOLD_SRC_PROCESS_PATTERN.test(cmdline) ? pid : null
    })
  )

  return matches.filter((pid): pid is number => pid !== null)
}

const isSteamRunning = async (): Promise<boolean> => {
  if (process.platform === 'linux') {
    const processIds = await listProcessIds()
    const matches = await Promise.all(
      processIds.map(async (pid) => {
        const [executable, cmdline] = await Promise.all([
          readProcessExecutable(pid),
          readProcessCmdline(pid)
        ])
        return isSteamClientProgram(executable) || commandLineMentionsSteamClient(cmdline)
      })
    )
    return matches.some(Boolean)
  }

  if (process.platform === 'win32') {
    return await new Promise<boolean>((resolveRunning) => {
      const child = spawn('tasklist.exe', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      let output = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8')
      })
      child.once('error', () => resolveRunning(false))
      child.once('exit', (code) =>
        resolveRunning(code === 0 && /^steam\.exe\s+/im.test(output.trim()))
      )
    })
  }

  return true
}

const watchSteamExit = (matchId: string): void => {
  const generation = ++steamExitWatchGeneration
  const check = async (): Promise<void> => {
    if (generation !== steamExitWatchGeneration) return
    if (!(await isSteamRunning())) {
      console.info('[GameLaunch] Steam exited after Counter-Strike; closing launcher', { matchId })
      app.quit()
      return
    }
    setTimeout(() => void check(), 2_000).unref?.()
  }
  void check()
}

const monitorLinuxCounterStrikeHandoff = async (
  matchId: string,
  gameDirectory: string,
  generation: number,
  matchConfigGeneration: number,
  antiCheatSession: AntiCheatSession,
  onExit?: (event: { code: number | null; signal: string | null }) => void
): Promise<void> => {
  const discoveryDeadline = Date.now() + LINUX_HANDOFF_DISCOVERY_TIMEOUT_MS
  let trackedPid: number | null = null
  let discoveryReported = false

  while (generation === linuxMonitorGeneration && launchedMatchId === matchId) {
    const processIds = await getLinuxCounterStrikeProcessIds(gameDirectory)

    if (trackedPid === null) {
      if (processIds.length > 0) {
        trackedPid = Math.max(...processIds)
        antiCheatSession.attachProcess(trackedPid)
        console.info('[GameLaunch] tracking Linux GoldSrc process after launcher handoff', {
          matchId,
          pid: trackedPid,
          gameDirectory
        })
      } else if (Date.now() >= discoveryDeadline && !discoveryReported) {
        // The game can be invisible from the host: when Steam runs inside an
        // emulation VM (box64/FEX/muvm) or a compatibility container, only the
        // wrapper process exists here. Never tear a live match session down
        // because of that - the backend stays authoritative for match state, and
        // the player may already be connected.
        discoveryReported = true
        console.warn(
          '[GameLaunch] no Linux GoldSrc process observed after launcher handoff; keeping the match session open',
          { matchId, gameDirectory }
        )
      }
    } else if (!processIds.includes(trackedPid)) {
      console.info('[GameLaunch] Linux GoldSrc process exited', { matchId, pid: trackedPid })
      if (generation === linuxMonitorGeneration && launchedMatchId === matchId) {
        stopGameWatchdog(matchId)
        stopAntiCheatSession(antiCheatSession, 'game-exit')
        clearMatchConfig(matchConfigGeneration)
        await finishVoicePttSession(matchId)
        await restoreManagedSkinAudio().catch(() => undefined)
        watchSteamExit(matchId)
        onExit?.({ code: null, signal: null })
      }
      return
    }

    await delay(LINUX_HANDOFF_POLL_MS)
  }
}

export const closeCounterStrikeForMatch = (matchId: string): void => {
  if (launchedMatchId !== matchId) return
  steamExitWatchGeneration++
  console.info('[GameLaunch] closing completed match', { matchId })
  gameProcessGeneration++
  linuxMonitorGeneration++
  stopGameWatchdog(matchId)
  finishAntiCheatSession(matchId, 'match-closed')
  void restoreManagedSkinAudio().catch((error: unknown) => {
    console.error('[SkinAudio] restore after managed match close failed', error)
  })
  terminateSpawnedGameProcess(gameProcess)
  if (process.platform === 'linux' && launchedGameDirectory) {
    void closeLinuxCounterStrikeProcesses(launchedGameDirectory).finally(() =>
      finishVoicePttSession(matchId)
    )
  }
  if (process.platform === 'win32' && launchedExecutablePath) {
    void closeWindowsCounterStrikeProcesses(launchedExecutablePath).finally(() =>
      finishVoicePttSession(matchId)
    )
  }
  launchedMatchId = null
  launchedGameDirectory = null
  launchedExecutablePath = null
  clearMatchConfig()
}

const closeLinuxCounterStrikeProcesses = async (gameDirectory: string): Promise<void> => {
  const processIds = await getLinuxCounterStrikeProcessIds(gameDirectory)
  let terminated = 0

  for (const pid of processIds) {
    try {
      process.kill(pid, 'SIGTERM')
      terminated++
    } catch {
      /* process already exited */
    }
  }

  console.info('[GameLaunch] completed-game Linux processes terminated', {
    gameDirectory,
    terminated
  })
}

const closeWindowsCounterStrikeProcesses = async (executablePath: string): Promise<number> => {
  const script = [
    "$target = [Environment]::GetEnvironmentVariable('CS16_TARGET_EXE')",
    '$matches = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [System.StringComparison]::OrdinalIgnoreCase) })',
    '$matches | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    'Write-Output $matches.Count'
  ].join('; ')

  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolveResult) => {
      const child = spawn(
        process.env.SystemRoot
          ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
          : 'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, CS16_TARGET_EXE: executablePath }
        }
      )
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.once('error', (error) => {
        resolveResult({ code: null, stdout, stderr: error.message })
      })
      child.once('exit', (code) => resolveResult({ code, stdout, stderr }))
    }
  )

  if (result.code !== 0) {
    console.warn('[GameLaunch] could not terminate existing Windows Counter-Strike process', {
      code: result.code,
      detail: result.stderr.trim() || 'PowerShell process lookup failed'
    })
    return 0
  }

  const terminated = Number(result.stdout.trim()) || 0
  console.info('[GameLaunch] Windows Counter-Strike processes terminated', { terminated })
  return terminated
}

const performLaunchCounterStrikeForMatch = async (input: MatchLaunchInput): Promise<void> => {
  console.info('[GameLaunch] match_connect received', {
    matchId: input.matchId,
    host: input.host,
    port: input.port
  })
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(input.matchId)) throw new Error('Invalid match ID')
  if (!SAFE_HOST.test(input.host)) throw new Error('Invalid game server host')
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('Invalid game server port')
  }
  if (!SAFE_PASSWORD.test(input.password)) throw new Error('Invalid game server password')
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(input.joinToken)) throw new Error('Invalid match join token')
  if (launchedMatchId === input.matchId && !input.forceRestart) return

  const relaunchingSameMatch = launchedMatchId === input.matchId && input.forceRestart === true
  const configuredExecutable =
    (await getSavedCs16Executable()) ?? process.env.CS16_CLIENT_EXECUTABLE_PATH
  console.info('[GameLaunch] executable configuration', {
    savedPath: configuredExecutable ?? null,
    source: configuredExecutable ? 'settings-or-environment' : 'missing'
  })
  if (!configuredExecutable) {
    throw new Error('Choose your Counter-Strike executable in Settings before joining a match.')
  }
  if (!isAbsolute(configuredExecutable)) {
    throw new Error('CS16_CLIENT_EXECUTABLE_PATH must be an absolute path.')
  }
  const executable = resolve(configuredExecutable)
  const playerName = getSessionUsername()
  if (!playerName || !/^[A-Za-z0-9_]{3,32}$/.test(playerName)) {
    throw new Error('The authenticated player name is unavailable or invalid.')
  }
  if (!(await stat(executable)).isFile()) {
    throw new Error('The configured Counter-Strike executable was not found.')
  }
  if (process.platform !== 'win32' && ((await stat(executable)).mode & 0o111) === 0) {
    throw new Error('The configured Counter-Strike executable is not executable.')
  }

  const configuredDirectory = process.env.CS16_CLIENT_GAME_DIRECTORY
  const configuredGameDirectory = configuredDirectory
    ? resolve(configuredDirectory)
    : dirname(executable)
  const cwd = await realpath(configuredGameDirectory).catch(() => configuredGameDirectory)
  if (!(await stat(cwd)).isDirectory()) {
    throw new Error('The configured Counter-Strike game directory was not found.')
  }
  const competitiveDirectory = await ensureCompetitiveGameDirectory(cwd)

  const launchTarget = await resolveCs16LaunchTarget(executable)
  const launchGameDirectory = competitiveDirectory
  console.info('[GameLaunch] Counter-Strike installation classified', {
    distribution: launchTarget.distribution,
    selectedExecutable: executable,
    launchExecutable: launchTarget.executable,
    gameExecutable: launchTarget.gameExecutable,
    usesLauncherHandoff: launchTarget.usesLauncherHandoff,
    usesSteamEmulation: launchTarget.usesSteamEmulation,
    launchGameDirectory
  })
  if (launchTarget.executable !== executable) {
    // Non-Steam repacks ship a wrapper that starts Counter-Strike and exits. It
    // may also self-update over the network, so keep the reason in the log.
    console.warn(
      '[GameLaunch] the selected executable is a launcher wrapper; following the game process it starts instead',
      {
        matchId: input.matchId,
        wrapper: launchTarget.executable,
        gameExecutable: launchTarget.gameExecutable
      }
    )
  }

  const processGeneration = ++gameProcessGeneration
  if (relaunchingSameMatch) {
    console.info('[GameLaunch] restarting Counter-Strike for match reconnect', {
      matchId: input.matchId,
      platform: process.platform
    })
    linuxMonitorGeneration++
    stopGameWatchdog(input.matchId)
    finishAntiCheatSession(input.matchId, 'relaunch')
    terminateSpawnedGameProcess(gameProcess)
    if (process.platform === 'win32')
      await closeWindowsCounterStrikeProcesses(launchTarget.gameExecutable)
    if (process.platform === 'linux') await closeLinuxCounterStrikeProcesses(cwd)
    gameProcess = null
    await delay(RELAUNCH_SETTLE_MS)
    await finishVoicePttSession(input.matchId)
  } else {
    stopGameWatchdog()
    if (activeAntiCheatSession) finishAntiCheatSession(undefined, 'new-match-launch')
    if (activeVoicePttSession) await finishVoicePttSession()
    // The launcher may have restarted after a prior handoff, leaving a GoldSrc
    // process alive while its in-memory match state is gone. GoldSrc allows one
    // client instance only, so clear that process before a fresh match launch.
    if (process.platform === 'win32') {
      const terminated = await closeWindowsCounterStrikeProcesses(launchTarget.gameExecutable)
      if (terminated > 0) await delay(RELAUNCH_SETTLE_MS)
    }
  }

  await prepareManagedSkinAudio(input.matchId, cwd)

  const requiresAddonsBridge = launchTarget.requiresAddonsBridge
  // Steam's own launch flags force `-game cstrike`, so the competitive game
  // directory is exposed through GoldSrc's addons search path instead.
  const addonsBridgeReady = requiresAddonsBridge ? await ensureSteamAddonsDirectory(cwd) : true
  const voicePttSession = await prepareVoicePtt(
    launchGameDirectory,
    input.onVoicePtt,
    await getSavedVoicePttKey()
  )
  activeVoicePttSession = { matchId: input.matchId, session: voicePttSession }

  const matchConfigName = '16competitive_match.cfg'
  const matchConfigPath = join(launchGameDirectory, matchConfigName)
  const matchConfigGeneration = ++nextMatchConfigGeneration
  const temporaryMatchConfigPath = `${matchConfigPath}.${input.matchId}.${matchConfigGeneration}.tmp`
  await unlink(join(launchGameDirectory, '16competitive-match.cfg')).catch(() => undefined)

  const identityCommands = [`name "${playerName}"`, `setinfo "_16c" "${input.joinToken}"`]

  try {
    await writeFile(
      temporaryMatchConfigPath,
      [
        ...identityCommands,
        ...voicePttSession.configCommands,
        `gl_max_size "${launchTarget.textureSize}"`,
        'cl_allowdownload "1"',
        'cl_download_ingame "1"',
        'cl_downloadfilter "all"',
        `password "${input.password}"`,
        // GoldSrc can process its normal user config after +exec during startup.
        // Wait a few frames, then reassert match identity and the PTT wrapper
        // immediately before connecting.
        ...Array.from({ length: MATCH_IDENTITY_WAIT_FRAMES }, () => 'wait'),
        ...identityCommands,
        ...voicePttSession.configCommands,
        `password "${input.password}"`,
        `connect ${input.host}:${input.port}`,
        ''
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 }
    )
    await rename(temporaryMatchConfigPath, matchConfigPath)
  } catch (error) {
    console.error('[GameLaunch] could not prepare match config', {
      matchId: input.matchId,
      error
    })
    await finishVoicePttSession(input.matchId)
    await restoreManagedSkinAudio().catch(() => undefined)
    throw new Error(
      'Could not prepare the Counter-Strike match connection. Please try reconnecting.'
    )
  } finally {
    await unlink(temporaryMatchConfigPath).catch(() => undefined)
  }
  launchedMatchConfigPath = matchConfigPath
  launchedMatchConfigGeneration = matchConfigGeneration

  const antiCheatSession = startAntiCheatSession({
    matchId: input.matchId,
    executablePath: executable,
    gameDirectory: cwd,
    distribution: launchTarget.distribution,
    ...(process.platform === 'win32' && launchTarget.usesLauncherHandoff
      ? {
          onProcessExit: () => {
            if (launchedMatchId !== input.matchId) return
            console.info('[GameLaunch] Windows GoldSrc process exited after launcher handoff', {
              matchId: input.matchId
            })
            stopGameWatchdog(input.matchId)
            finishAntiCheatSession(input.matchId, 'game-exit')
            void finishVoicePttSession(input.matchId)
            void restoreManagedSkinAudio().catch((error: unknown) => {
              console.error('[SkinAudio] restore after Windows game exit failed', error)
            })
            launchedMatchId = null
            launchedGameDirectory = null
            launchedExecutablePath = null
            clearMatchConfig(matchConfigGeneration)
            if (launchTarget.distribution === 'steam') watchSteamExit(input.matchId)
            input.onExit?.({ code: null, signal: null })
          }
        }
      : {})
  })
  activeAntiCheatSession = { matchId: input.matchId, session: antiCheatSession }

  // The match configuration carries the join identity and password. Only repeat
  // them on the command line when the engine may not find that config (the addons
  // bridge could not be created), so the secret values normally never appear in
  // the process list.
  const identityArgs = addonsBridgeReady
    ? []
    : ['+name', playerName, '+setinfo', '_16c', input.joinToken, '+password', input.password]
  const directMatchArgs = [
    '-condebug',
    ...identityArgs,
    '+exec',
    matchConfigName,
    '+connect',
    `${input.host}:${input.port}`
  ]
  const gameArgs = directMatchArgs
  const launchArgs = [
    ...launchTarget.argumentPrefix,
    ...voicePttSession.launchArguments,
    ...gameArgs
  ]
  launchedGameDirectory = cwd
  // Track the GoldSrc binary rather than the selected path: for a wrapper the
  // selected executable has already exited and match cleanup would miss the game.
  launchedExecutablePath = launchTarget.gameExecutable
  await startManagedSkinAudioConnectionGuard(input.matchId, cwd).catch((error: unknown) => {
    console.error('[SkinAudio] could not start external-server guard', error)
  })
  const directLaunch = !launchTarget.usesLauncherHandoff
  if (
    directLaunch &&
    process.platform === 'linux' &&
    launchTarget.distribution === 'steam' &&
    !(await isSteamRunning())
  ) {
    // Steam owns authentication for the Steam build of Counter-Strike. Launching
    // directly is still attempted so the client can report the real failure, but
    // the reason is worth recording in the launcher log.
    console.warn(
      '[GameLaunch] Steam does not appear to be running; Counter-Strike may refuse to start',
      { matchId: input.matchId }
    )
  }
  console.info('[GameLaunch] starting Counter-Strike', {
    distribution: launchTarget.distribution,
    executable: launchTarget.executable,
    cwd,
    args: launchArgs.map((argument) =>
      argument === input.joinToken || argument === input.password ? '[redacted]' : argument
    ),
    playerName,
    joinTokenPresent: true,
    voicePttKeys: voicePttSession.keys,
    relaunchingSameMatch
  })

  let spawnedProcess: ChildProcess
  try {
    spawnedProcess = await new Promise<ChildProcess>((resolveProcess, reject) => {
      const child = spawn(launchTarget.executable, launchArgs, {
        cwd,
        shell: false,
        // A direct launch becomes its own process group so the match lifecycle
        // (reconnect, match closed, launcher exit) can terminate the whole tree
        // even when the game itself hides behind a launcher script or emulator.
        detached: directLaunch,
        // Keep the standalone launcher's output while diagnosing handoff
        // failures. It is deliberately capped below and credentials are
        // redacted before it is written to the application log.
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...(directLaunch && process.platform === 'linux' && launchTarget.distribution === 'steam'
            ? {
                SteamAppId: STEAM_COUNTER_STRIKE_APP_ID,
                SteamGameId: STEAM_COUNTER_STRIKE_APP_ID
              }
            : {}),
          LD_LIBRARY_PATH:
            process.platform === 'linux' && directLaunch
              ? [dirname(executable), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
              : process.env.LD_LIBRARY_PATH
        }
      })
      child.once('error', reject)
      child.once('spawn', () => resolveProcess(child))
    })
  } catch (error) {
    stopAntiCheatSession(antiCheatSession, 'launch-failed')
    await finishVoicePttSession(input.matchId)
    await restoreManagedSkinAudio().catch(() => undefined)
    throw error
  }

  if (launchTarget.usesLauncherHandoff) spawnedProcess.unref()
  gameProcess = spawnedProcess
  launchedMatchId = input.matchId
  startGameWatchdog(input.matchId, launchTarget.gameExecutable)
  const linuxHandoffMonitorGeneration =
    process.platform === 'linux' && launchTarget.usesLauncherHandoff
      ? ++linuxMonitorGeneration
      : linuxMonitorGeneration

  if (!launchTarget.usesLauncherHandoff && spawnedProcess.pid) {
    antiCheatSession.attachProcess(spawnedProcess.pid)
  } else if (process.platform === 'win32' && launchTarget.usesLauncherHandoff) {
    void antiCheatSession.attachWhenWindowsProcessAppears(launchTarget.gameExecutable)
  }

  console.info('[GameLaunch] process spawned', { matchId: input.matchId, pid: gameProcess.pid })
  let gameOutput = ''
  const appendGameOutput = (chunk: Buffer): void => {
    gameOutput = `${gameOutput}${chunk.toString('utf8')}`.slice(-8_000)
  }
  gameProcess.stdout?.on('data', appendGameOutput)
  gameProcess.stderr?.on('data', appendGameOutput)
  spawnedProcess.once('exit', (code, signal) => {
    if (launchTarget.usesLauncherHandoff) {
      console.info('[GameLaunch] launcher handoff completed', {
        matchId: input.matchId,
        distribution: launchTarget.distribution,
        code,
        signal
      })
      if (gameOutput.trim()) {
        const safeOutput = gameOutput
          .replaceAll(input.password, '[redacted]')
          .replaceAll(input.joinToken, '[redacted]')
        console.error('[GameLaunch] standalone launcher output', {
          matchId: input.matchId,
          output: safeOutput
        })
      }
      if (gameProcess === spawnedProcess) gameProcess = null
      if (process.platform === 'linux') {
        void monitorLinuxCounterStrikeHandoff(
          input.matchId,
          cwd,
          linuxHandoffMonitorGeneration,
          matchConfigGeneration,
          antiCheatSession,
          input.onExit
        )
      }
      return
    }
    console.info('[GameLaunch] process exited', {
      matchId: input.matchId,
      code,
      signal
    })
    stopAntiCheatSession(antiCheatSession, 'game-exit')
    void finishVoicePttSession(input.matchId)
    if (gameOutput.trim()) {
      const safeOutput = gameOutput
        .replaceAll(input.password, '[redacted]')
        .replaceAll(input.joinToken, '[redacted]')
      console.error('[GameLaunch] native client output', {
        matchId: input.matchId,
        output: safeOutput
      })
    }
    if (gameProcess === spawnedProcess) gameProcess = null
    if (processGeneration !== gameProcessGeneration || launchedMatchId !== input.matchId) {
      console.info('[GameLaunch] ignoring stale process exit', {
        matchId: input.matchId,
        processGeneration,
        activeGeneration: gameProcessGeneration
      })
      return
    }
    stopGameWatchdog(input.matchId)
    void restoreManagedSkinAudio().catch((error: unknown) => {
      console.error('[SkinAudio] restore after game exit failed', error)
    })
    launchedMatchId = null
    launchedGameDirectory = null
    launchedExecutablePath = null
    clearMatchConfig(matchConfigGeneration)
    if (launchTarget.distribution === 'steam') watchSteamExit(input.matchId)
    input.onExit?.({ code, signal })
  })
}

export const launchCounterStrikeForMatch = (input: MatchLaunchInput): Promise<void> => {
  if (input.forceRestart && forcedLaunchInFlight?.matchId === input.matchId) {
    return forcedLaunchInFlight.promise
  }

  const operation = launchQueue
    .catch(() => undefined)
    .then(() => performLaunchCounterStrikeForMatch(input))

  launchQueue = operation.catch(() => undefined)

  if (!input.forceRestart) return operation

  const trackedPromise = operation.finally(() => {
    if (forcedLaunchInFlight?.promise === trackedPromise) forcedLaunchInFlight = null
  })
  forcedLaunchInFlight = { matchId: input.matchId, promise: trackedPromise }
  return trackedPromise
}

export const isCounterStrikeActiveForMatch = (matchId: string): boolean =>
  launchedMatchId === matchId
