import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import { readdir, readlink, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { getSavedCs16Executable, getSavedVoicePttKey } from './game-settings'
import { getSessionUsername } from '../auth'
import { resolveCs16LaunchTarget } from './cs16-installation'
import { prepareVoicePtt, type VoicePttSession } from './voice-ptt'

const SAFE_HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/
const SAFE_PASSWORD = /^[A-Za-z0-9_-]{1,128}$/
const MATCH_IDENTITY_WAIT_FRAMES = 20
const RELAUNCH_SETTLE_MS = 500
const LINUX_HANDOFF_DISCOVERY_TIMEOUT_MS = 30_000
const LINUX_HANDOFF_POLL_MS = 1_000

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

const clearMatchConfig = (generation?: number): void => {
  if (generation !== undefined && launchedMatchConfigGeneration !== generation) return
  const matchConfigPath = launchedMatchConfigPath
  launchedMatchConfigPath = null
  launchedMatchConfigGeneration = 0
  if (matchConfigPath) void unlink(matchConfigPath).catch(() => undefined)
}

const getLinuxCounterStrikeProcessIds = async (gameDirectory: string): Promise<number[]> => {
  const entries = await readdir('/proc', { withFileTypes: true }).catch(() => [])
  const processIds: number[] = []

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) return
      const pid = Number(entry.name)
      if (pid === process.pid) return
      const [cwd, executable] = await Promise.all([
        readlink(`/proc/${pid}/cwd`).catch(() => ''),
        readlink(`/proc/${pid}/exe`).catch(() => '')
      ])
      if (cwd === gameDirectory && basename(executable) === 'hl_linux') processIds.push(pid)
    })
  )

  return processIds
}

const isSteamRunning = async (): Promise<boolean> => {
  if (process.platform === 'linux') {
    const entries = await readdir('/proc', { withFileTypes: true }).catch(() => [])
    const processNames = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
        .map(async (entry) => basename(await readlink(`/proc/${entry.name}/exe`).catch(() => '')))
    )
    return processNames.some((name) => name.toLowerCase() === 'steam')
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
  onExit?: (event: { code: number | null; signal: string | null }) => void
): Promise<void> => {
  const discoveryDeadline = Date.now() + LINUX_HANDOFF_DISCOVERY_TIMEOUT_MS
  let trackedPid: number | null = null

  while (generation === linuxMonitorGeneration && launchedMatchId === matchId) {
    const processIds = await getLinuxCounterStrikeProcessIds(gameDirectory)

    if (trackedPid === null) {
      if (processIds.length > 0) {
        trackedPid = Math.max(...processIds)
        console.info('[GameLaunch] tracking Linux GoldSrc process after launcher handoff', {
          matchId,
          pid: trackedPid,
          gameDirectory
        })
      } else if (Date.now() >= discoveryDeadline) {
        console.warn('[GameLaunch] Linux GoldSrc process was not found after launcher handoff', {
          matchId,
          gameDirectory
        })
        if (generation === linuxMonitorGeneration && launchedMatchId === matchId) {
          clearMatchConfig(matchConfigGeneration)
          await finishVoicePttSession(matchId)
          watchSteamExit(matchId)
          onExit?.({ code: null, signal: null })
        }
        return
      }
    } else if (!processIds.includes(trackedPid)) {
      console.info('[GameLaunch] Linux GoldSrc process exited', { matchId, pid: trackedPid })
      if (generation === linuxMonitorGeneration && launchedMatchId === matchId) {
        clearMatchConfig(matchConfigGeneration)
        await finishVoicePttSession(matchId)
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
  if (gameProcess?.exitCode === null) gameProcess.kill('SIGTERM')
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

const closeWindowsCounterStrikeProcesses = async (executablePath: string): Promise<void> => {
  const script = [
    "$target = [Environment]::GetEnvironmentVariable('CS16_TARGET_EXE')",
    '$matches = @(Get-CimInstance Win32_Process -Filter "Name=\'hl.exe\'" | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [System.StringComparison]::OrdinalIgnoreCase) })',
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
    return
  }

  const terminated = Number(result.stdout.trim()) || 0
  console.info('[GameLaunch] Windows Counter-Strike processes terminated', { terminated })
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

  const processGeneration = ++gameProcessGeneration
  if (relaunchingSameMatch) {
    console.info('[GameLaunch] restarting Counter-Strike for match reconnect', {
      matchId: input.matchId,
      platform: process.platform
    })
    linuxMonitorGeneration++
    if (process.platform === 'win32') await closeWindowsCounterStrikeProcesses(executable)
    if (process.platform === 'linux') await closeLinuxCounterStrikeProcesses(cwd)
    gameProcess = null
    await delay(RELAUNCH_SETTLE_MS)
    await finishVoicePttSession(input.matchId)
  } else if (activeVoicePttSession) {
    await finishVoicePttSession()
  }

  const launchTarget = await resolveCs16LaunchTarget(executable)
  const voicePttSession = await prepareVoicePtt(cwd, input.onVoicePtt, await getSavedVoicePttKey())
  activeVoicePttSession = { matchId: input.matchId, session: voicePttSession }

  const matchConfigName = '16competitive_match.cfg'
  const matchConfigPath = join(cwd, 'cstrike', matchConfigName)
  const matchConfigGeneration = ++nextMatchConfigGeneration
  const temporaryMatchConfigPath = `${matchConfigPath}.${input.matchId}.${matchConfigGeneration}.tmp`
  await unlink(join(cwd, 'cstrike', '16competitive-match.cfg')).catch(() => undefined)

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
    throw new Error(
      'Could not prepare the Counter-Strike match connection. Please try reconnecting.'
    )
  } finally {
    await unlink(temporaryMatchConfigPath).catch(() => undefined)
  }
  launchedMatchConfigPath = matchConfigPath
  launchedMatchConfigGeneration = matchConfigGeneration

  const directMatchArgs = ['+exec', matchConfigName, '+connect', `${input.host}:${input.port}`]
  const gameArgs = directMatchArgs
  const launchArgs = [
    ...launchTarget.argumentPrefix,
    ...voicePttSession.launchArguments,
    ...gameArgs
  ]
  launchedGameDirectory = cwd
  launchedExecutablePath = executable
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
        stdio: launchTarget.usesLauncherHandoff
          ? ['ignore', 'ignore', 'ignore']
          : ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          LD_LIBRARY_PATH:
            process.platform === 'linux' && !launchTarget.usesLauncherHandoff
              ? [dirname(executable), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
              : process.env.LD_LIBRARY_PATH
        }
      })
      child.once('error', reject)
      child.once('spawn', () => resolveProcess(child))
    })
  } catch (error) {
    await finishVoicePttSession(input.matchId)
    throw error
  }

  if (launchTarget.usesLauncherHandoff) spawnedProcess.unref()
  gameProcess = spawnedProcess
  launchedMatchId = input.matchId
  const linuxHandoffMonitorGeneration =
    process.platform === 'linux' && launchTarget.usesLauncherHandoff
      ? ++linuxMonitorGeneration
      : linuxMonitorGeneration
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
      if (gameProcess === spawnedProcess) gameProcess = null
      if (process.platform === 'linux') {
        void monitorLinuxCounterStrikeHandoff(
          input.matchId,
          cwd,
          linuxHandoffMonitorGeneration,
          matchConfigGeneration,
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
