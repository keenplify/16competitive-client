import { spawn, type ChildProcess } from 'node:child_process'
import { copyFile, readFile, readdir, readlink, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { getSavedCs16Executable } from './game-settings'
import { getSessionUsername } from '../auth'

const SAFE_HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/
const SAFE_PASSWORD = /^[A-Za-z0-9_-]{1,128}$/

let gameProcess: ChildProcess | null = null
let launchedMatchId: string | null = null
let launchedGameDirectory: string | null = null

export const closeCounterStrikeForMatch = (matchId: string): void => {
  if (launchedMatchId !== matchId) return
  console.info('[GameLaunch] closing completed match', { matchId })
  if (gameProcess?.exitCode === null) gameProcess.kill('SIGTERM')
  if (process.platform === 'linux' && launchedGameDirectory) {
    void closeLinuxCounterStrikeProcesses(launchedGameDirectory)
  }
  launchedGameDirectory = null
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
  if (launchedMatchId === input.matchId && gameProcess?.exitCode === null) return

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
  launchedGameDirectory = cwd
  console.info('[GameLaunch] starting Counter-Strike', {
    executable: process.platform === 'linux' ? 'steam' : executable,
    cwd,
    args: [
      '-game',
      'cstrike',
      '+password',
      '[redacted]',
      '+name',
      playerName,
      '+setinfo',
      '_16c',
      '[redacted]',
      '+exec',
      '16competitive.cfg',
      '+connect',
      `${input.host}:${input.port}`
    ]
  })
  if (!(await stat(cwd)).isDirectory()) {
    throw new Error('The configured Counter-Strike game directory was not found.')
  }
  const competitiveConfigPath = join(cwd, 'cstrike', '16competitive.cfg')
  await writeFile(
    competitiveConfigPath,
    `name "${playerName}"\nsetinfo "_16c" "${input.joinToken}"\n`,
    { mode: 0o600 }
  )
  const gameConfigPath = join(cwd, 'cstrike', 'config.cfg')
  const gameConfig = await readFile(gameConfigPath, 'utf8').catch(() => '')
  const nameCommand = `name "${playerName}"`
  const updatedGameConfig = /^name\s+.*$/im.test(gameConfig)
    ? gameConfig.replace(/^name\s+.*$/im, nameCommand)
    : `${gameConfig.trimEnd()}\n${nameCommand}\n`
  if (updatedGameConfig !== gameConfig) {
    await copyFile(gameConfigPath, `${gameConfigPath}.16competitive-backup`).catch(() => undefined)
    await writeFile(gameConfigPath, updatedGameConfig, { mode: 0o600 })
  }

  const spawnedProcess = await new Promise<ChildProcess>((resolveProcess, reject) => {
    const useSteamLauncher = process.platform === 'linux'
    const launchExecutable = useSteamLauncher ? 'steam' : executable
    const launchArgs =
      process.platform === 'linux'
        ? [
            '-applaunch',
            '10',
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
            '16competitive.cfg',
            '+connect',
            `${input.host}:${input.port}`
          ]
        : [
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
            '16competitive.cfg',
            '+connect',
            `${input.host}:${input.port}`
          ]
    const child = spawn(launchExecutable, launchArgs, {
      cwd,
      shell: false,
      stdio: 'ignore',
      env: {
        ...process.env,
        // hl.sh sets this before invoking hl_linux. Without it the Steam
        // runtime libraries are not found and the client can exit cleanly.
        LD_LIBRARY_PATH: !useSteamLauncher
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
  spawnedProcess.once('exit', (code, signal) => {
    console.info('[GameLaunch] process exited', {
      matchId: input.matchId,
      code,
      signal
    })
    if (gameProcess === spawnedProcess) gameProcess = null
    input.onExit?.({ code, signal })
  })
}
