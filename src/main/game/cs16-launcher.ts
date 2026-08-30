import { spawn, type ChildProcess } from 'node:child_process'
import { readdir, readlink, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { getSavedCs16Executable } from './game-settings'
import { getSessionUsername } from '../auth'

const SAFE_HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/
const SAFE_PASSWORD = /^[A-Za-z0-9_-]{1,128}$/

let gameProcess: ChildProcess | null = null
let launchedMatchId: string | null = null
let launchedGameDirectory: string | null = null
let launchedViaSteam = false
let launchedMatchConfigPath: string | null = null

export const closeCounterStrikeForMatch = (matchId: string): void => {
  if (launchedMatchId !== matchId) return
  console.info('[GameLaunch] closing completed match', { matchId })
  if (gameProcess?.exitCode === null) gameProcess.kill('SIGTERM')
  if (process.platform === 'linux' && launchedGameDirectory) {
    void closeLinuxCounterStrikeProcesses(launchedGameDirectory)
  }
  launchedGameDirectory = null
  launchedViaSteam = false
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

export const launchCounterStrikeForMatch = async (input: {
  matchId: string
  host: string
  port: number
  password: string
  joinToken: string
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
  if (
    launchedMatchId === input.matchId &&
    (gameProcess?.exitCode === null || launchedViaSteam)
  ) {
    return
  }

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
  // Let Steam launch the installed client on Linux. GoldSrc's direct binary
  // startup differs across Steam builds and can crash before the client
  // initializes; Steam owns the supported runtime selection for app 10.
  const launchViaSteam = process.platform === 'linux'
  const launchExecutable = launchViaSteam ? 'steam' : executable
  const matchConfigName = '16competitive-match.cfg'
  const matchConfigPath = join(cwd, 'cstrike', matchConfigName)
  const temporaryMatchConfigPath = `${matchConfigPath}.${input.matchId}.tmp`
  // Use engine console commands for the password and connection. Unlike
  // `+password`, this is reliably applied when Steam forwards launch options
  // to different GoldSrc client builds.
  await writeFile(
    temporaryMatchConfigPath,
    [
      `name "${playerName}"`,
      `setinfo "_16c" "${input.joinToken}"`,
      `password "${input.password}"`,
      `connect "${input.host}:${input.port}"`,
      ''
    ].join('\n'),
    { encoding: 'utf8', mode: 0o600 }
  )
  await rename(temporaryMatchConfigPath, matchConfigPath)
  launchedMatchConfigPath = matchConfigPath
  // Keep connection commands on the command line as well: some Steam/GoldSrc
  // builds ignore `+exec` during URL parameter processing and otherwise stop
  // at the main menu without ever attempting the server connection.
  const gameArgs = [
    '-game',
    'cstrike',
    '+password',
    input.password,
    '+name',
    playerName,
    '+setinfo',
    '_16c',
    input.joinToken,
    '+exec',
    matchConfigName,
    '+connect',
    `${input.host}:${input.port}`
  ]
  // Steam forwards the remaining app arguments directly to hl.sh. Do not add
  // `--`: Steam passes it through to GoldSrc as an actual engine argument.
  const launchArgs = launchViaSteam ? ['-applaunch', '10', ...gameArgs] : gameArgs
  launchedGameDirectory = cwd
  console.info('[GameLaunch] starting Counter-Strike', {
    executable: launchExecutable,
    cwd,
    args: launchArgs.map((argument, index) =>
      launchArgs[index - 1] === '+password' || launchArgs[index - 1] === '_16c'
        ? '[redacted]'
        : argument
    )
  })
  const spawnedProcess = await new Promise<ChildProcess>((resolveProcess, reject) => {
    const child = spawn(launchExecutable, launchArgs, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // The non-Steam fallback needs the same libraries as hl.sh.
        LD_LIBRARY_PATH:
          process.platform === 'linux' && !launchViaSteam
            ? [dirname(executable), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
            : process.env.LD_LIBRARY_PATH
      }
    })
    child.once('error', reject)
    child.once('spawn', () => resolveProcess(child))
  })
  gameProcess = spawnedProcess
  launchedMatchId = input.matchId
  launchedViaSteam = launchViaSteam
  console.info('[GameLaunch] process spawned', { matchId: input.matchId, pid: gameProcess.pid })
  let gameOutput = ''
  const appendGameOutput = (chunk: Buffer): void => {
    gameOutput = `${gameOutput}${chunk.toString('utf8')}`.slice(-8_000)
  }
  gameProcess.stdout?.on('data', appendGameOutput)
  gameProcess.stderr?.on('data', appendGameOutput)
  spawnedProcess.once('exit', (code, signal) => {
    if (launchViaSteam) {
      // The Steam CLI intentionally exits after handing the request to the
      // running Steam client. Its lifecycle is not the game's lifecycle.
      console.info('[GameLaunch] Steam handoff completed', { matchId: input.matchId, code, signal })
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
      console.error('[GameLaunch] native client output', { matchId: input.matchId, output: safeOutput })
    }
    if (gameProcess === spawnedProcess) gameProcess = null
    const matchConfigPath = launchedMatchConfigPath
    launchedMatchConfigPath = null
    if (matchConfigPath) void unlink(matchConfigPath).catch(() => undefined)
    input.onExit?.({ code, signal })
  })
}
