import { spawn, type ChildProcess } from 'node:child_process'
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
import { getSavedCs16Executable } from './game-settings'
import { getSessionUsername } from '../auth'
import { resolveCs16LaunchTarget } from './cs16-installation'

const SAFE_HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/
const SAFE_PASSWORD = /^[A-Za-z0-9_-]{1,128}$/
const MATCH_IDENTITY_WAIT_FRAMES = 20
const RELAUNCH_SETTLE_MS = 500

let gameProcess: ChildProcess | null = null
let launchedMatchId: string | null = null
let launchedGameDirectory: string | null = null
let launchedExecutablePath: string | null = null
let launchedMatchConfigPath: string | null = null

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

export const closeCounterStrikeForMatch = (matchId: string): void => {
  if (launchedMatchId !== matchId) return
  console.info('[GameLaunch] closing completed match', { matchId })
  if (gameProcess?.exitCode === null) gameProcess.kill('SIGTERM')
  if (process.platform === 'linux' && launchedGameDirectory) {
    void closeLinuxCounterStrikeProcesses(launchedGameDirectory)
  }
  if (process.platform === 'win32' && launchedExecutablePath) {
    void closeWindowsCounterStrikeProcesses(launchedExecutablePath)
  }
  launchedGameDirectory = null
  launchedExecutablePath = null
  const matchConfigPath = launchedMatchConfigPath
  launchedMatchConfigPath = null
  if (matchConfigPath) void unlink(matchConfigPath).catch(() => undefined)
}

const closeLinuxCounterStrikeProcesses = async (gameDirectory: string): Promise<void> => {
  const entries = await readdir('/proc', { withFileTypes: true }).catch(() => [])
  let terminated = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
    const pid = Number(entry.name)
    if (pid === process.pid) continue
    const [cwd, executable] = await Promise.all([
      readlink(`/proc/${pid}/cwd`).catch(() => ''),
      readlink(`/proc/${pid}/exe`).catch(() => '')
    ])
    // Never use a broad name-based kill. Only terminate a CS executable whose
    // working directory is the exact installation selected in Settings.
    if (cwd === gameDirectory && basename(executable) === 'hl_linux') {
      try {
        process.kill(pid, 'SIGTERM')
        terminated++
      } catch {
        /* process already exited */
      }
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

const synchronizeUserConfigIdentity = async (
  gameDirectory: string,
  playerName: string,
  joinToken: string
): Promise<void> => {
  const configPath = join(gameDirectory, 'cstrike', 'config.cfg')
  const existing = await readFile(configPath, 'utf8').catch(() => '')
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const lines = existing
    .split(/\r?\n/)
    .filter(
      (line) => !/^\s*name(?:\s|$)/i.test(line) && !/^\s*setinfo\s+"?_16c"?(?:\s|$)/i.test(line)
    )
  while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop()
  lines.push(`name "${playerName}"`, `setinfo "_16c" "${joinToken}"`, '')
  await writeFile(configPath, lines.join(eol), { encoding: 'utf8' })
  console.info('[GameLaunch] synchronized Counter-Strike identity config', {
    playerName,
    joinTokenPresent: true
  })
}

export const launchCounterStrikeForMatch = async (input: {
  matchId: string
  host: string
  port: number
  password: string
  joinToken: string
  forceRestart?: boolean
  onExit?: (event: { code: number | null; signal: string | null }) => void
}): Promise<void> => {
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
  // match_connect is durable server state and may be delivered more than once
  // during socket recovery or API-host handoff. Only the explicit Reconnect
  // action is allowed to restart a match that this launcher already started.
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

  if (relaunchingSameMatch) {
    console.info('[GameLaunch] restarting Counter-Strike for match reconnect', {
      matchId: input.matchId,
      platform: process.platform
    })
    if (process.platform === 'win32') await closeWindowsCounterStrikeProcesses(executable)
    if (process.platform === 'linux') await closeLinuxCounterStrikeProcesses(cwd)
    gameProcess = null
    await delay(RELAUNCH_SETTLE_MS)
  }

  const launchTarget = await resolveCs16LaunchTarget(executable)
  await synchronizeUserConfigIdentity(cwd, playerName, input.joinToken)

  const matchConfigName = '16competitive_match.cfg'
  const matchConfigPath = join(cwd, 'cstrike', matchConfigName)
  const temporaryMatchConfigPath = `${matchConfigPath}.${input.matchId}.tmp`
  await unlink(join(cwd, 'cstrike', '16competitive-match.cfg')).catch(() => undefined)

  const identityCommands = [`name "${playerName}"`, `setinfo "_16c" "${input.joinToken}"`]

  await writeFile(
    temporaryMatchConfigPath,
    [
      ...identityCommands,
      `gl_max_size "${launchTarget.textureSize}"`,
      'cl_allowdownload "1"',
      'cl_download_ingame "1"',
      'cl_downloadfilter "all"',
      `password "${input.password}"`,
      // GoldSrc can process its normal user config after +exec during startup.
      // Wait a few frames, then reassert match identity immediately before connecting.
      ...Array.from({ length: MATCH_IDENTITY_WAIT_FRAMES }, () => 'wait'),
      ...identityCommands,
      `password "${input.password}"`,
      // This GoldSrc build retains quotes around the connect argument and then
      // rejects the otherwise valid endpoint as a bad server address.
      `connect ${input.host}:${input.port}`,
      ''
    ].join('\n'),
    { encoding: 'utf8', mode: 0o600 }
  )
  await rename(temporaryMatchConfigPath, matchConfigPath)
  launchedMatchConfigPath = matchConfigPath

  // GoldSrc reparses command lines and can interpret a hyphen inside a secret as
  // a new launch option. Keep the password and join token exclusively in the
  // restricted config files so their complete values reach the engine and do
  // not leak through the OS process list. The final connect remains a fallback
  // when Steam forwards parameters to an already-running client.
  const directMatchArgs = ['+exec', matchConfigName, '+connect', `${input.host}:${input.port}`]
  const gameArgs = directMatchArgs
  // Linux Steam forwards the remaining app arguments directly to GoldSrc. Do
  // not add `--`: Steam passes it through as an actual engine argument. The
  // Windows/direct and standalone targets consume the same argument array.
  const launchArgs = [...launchTarget.argumentPrefix, ...gameArgs]
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
    relaunchingSameMatch
  })
  const spawnedProcess = await new Promise<ChildProcess>((resolveProcess, reject) => {
    const child = spawn(launchTarget.executable, launchArgs, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // The non-Steam fallback needs the same libraries as hl.sh.
        LD_LIBRARY_PATH:
          process.platform === 'linux' && !launchTarget.usesLauncherHandoff
            ? [dirname(executable), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
            : process.env.LD_LIBRARY_PATH
      }
    })
    child.once('error', reject)
    child.once('spawn', () => resolveProcess(child))
  })
  gameProcess = spawnedProcess
  launchedMatchId = input.matchId
  console.info('[GameLaunch] process spawned', { matchId: input.matchId, pid: gameProcess.pid })
  let gameOutput = ''
  const appendGameOutput = (chunk: Buffer): void => {
    gameOutput = `${gameOutput}${chunk.toString('utf8')}`.slice(-8_000)
  }
  gameProcess.stdout?.on('data', appendGameOutput)
  gameProcess.stderr?.on('data', appendGameOutput)
  spawnedProcess.once('exit', (code, signal) => {
    if (launchTarget.usesLauncherHandoff) {
      // Steam and some standalone launchers exit after starting the actual
      // GoldSrc process. Keep the match config in place for that child process.
      console.info('[GameLaunch] launcher handoff completed', {
        matchId: input.matchId,
        distribution: launchTarget.distribution,
        code,
        signal
      })
      if (gameProcess === spawnedProcess) gameProcess = null
      return
    }
    console.info('[GameLaunch] process exited', {
      matchId: input.matchId,
      code,
      signal
    })
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
    const matchConfigPath = launchedMatchConfigPath
    launchedMatchConfigPath = null
    if (matchConfigPath) void unlink(matchConfigPath).catch(() => undefined)
    input.onExit?.({ code, signal })
  })
}
