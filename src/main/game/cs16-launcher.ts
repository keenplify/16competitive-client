import { spawn } from 'node:child_process'
import { readFile, readdir, readlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { stopGameWatchdog } from '../anticheat/game-watchdog'
import { matchmakingDiagnostics } from '../matchmaking-diagnostics'
import { getGameSettings } from './game-settings'
import { shutdownManagedAdapters } from './managed-session-registry'
import { ScoreboardOverlaySession } from './scoreboard-overlay'
import { restoreManagedSkinAudio } from './skin-audio-override'
import {
  launchStandaloneSession,
  standaloneSessionStatus,
  stopStandaloneSession
} from './standalone-session'
import { type VoiceTalkChannel } from './voice-ptt'
const WINDOWS_GRACEFUL_CLOSE_TIMEOUT_MS = 10_000

interface MatchLaunchInput {
  matchId: string
  identityMatchId?: string
  host: string
  port: number
  password: string
  joinToken: string
  apiUrl?: string
  forceRestart?: boolean
  onVoicePtt?: (active: boolean, channel: VoiceTalkChannel) => void
  onExit?: (event: { code: number | null; signal: string | null }) => void
}

let launchQueue: Promise<void> = Promise.resolve()
let forcedLaunchInFlight: { matchId: string; promise: Promise<void> } | null = null
const pendingGameCloses = new Set<Promise<number>>()
const trackGameClose = (operation: Promise<number>): Promise<number> => {
  pendingGameCloses.add(operation)
  void operation.then(
    () => pendingGameCloses.delete(operation),
    () => pendingGameCloses.delete(operation)
  )
  return operation
}
const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

/** Rust owns CS 1.6 cleanup; legacy adapters retain their own recovery lifecycle. */
export const shutdownManagedGame = async (): Promise<void> => {
  await stopStandaloneSession()
  await shutdownManagedAdapters()
  await Promise.all([
    ...pendingGameCloses,
    ScoreboardOverlaySession.waitForCleanup(),
    restoreManagedSkinAudio()
  ])
  stopGameWatchdog()
}

export const launchOrdinaryCounterStrike = (launch: () => Promise<void>): Promise<void> => {
  const operation = launchQueue
    .catch(() => undefined)
    .then(async () => {
      await shutdownManagedGame()
      await launch()
    })
  launchQueue = operation.catch(() => undefined)
  return operation
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

export const getLinuxCounterStrikeProcessIds = async (gameDirectory: string): Promise<number[]> => {
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

export const isSteamRunning = async (): Promise<boolean> => {
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

export const closeCounterStrikeForMatch = (matchId: string): void => {
  if (!standaloneSessionStatus(matchId).owned) return
  void stopStandaloneSession().catch((error: unknown) =>
    console.error('[GameLaunch] native cleanup failed', error)
  )
}

export const closeLinuxCounterStrikeProcesses = (gameDirectory: string): Promise<number> =>
  trackGameClose(performCloseLinuxCounterStrikeProcesses(gameDirectory))
const performCloseLinuxCounterStrikeProcesses = async (gameDirectory: string): Promise<number> => {
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
  if (terminated > 0) {
    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await getLinuxCounterStrikeProcessIds(gameDirectory)).length === 0) return terminated
      await delay(100)
    }
    throw new Error(
      'Counter-Strike is still running. Close the game, then reconnect from the launcher.'
    )
  }
  return terminated
}

export const closeWindowsCounterStrikeProcesses = (executablePath: string): Promise<number> =>
  trackGameClose(performCloseWindowsCounterStrikeProcesses(executablePath))
const performCloseWindowsCounterStrikeProcesses = async (
  executablePath: string
): Promise<number> => {
  const script = [
    "$target = [Environment]::GetEnvironmentVariable('CS16_TARGET_EXE')",
    '$matches = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [System.StringComparison]::OrdinalIgnoreCase) })',
    `$matches | ForEach-Object { $game = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($game) { try { if ($game.CloseMainWindow()) { $game.WaitForExit(${WINDOWS_GRACEFUL_CLOSE_TIMEOUT_MS}) | Out-Null } } catch {} } }`,
    '$remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [System.StringComparison]::OrdinalIgnoreCase) })',
    'Write-Output "$($matches.Count)|$($remaining.Count)"'
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
    console.warn('[GameLaunch] could not close existing Windows Counter-Strike process', {
      code: result.code,
      detail: result.stderr.trim() || 'PowerShell process lookup failed'
    })
    return 0
  }

  const [matchedText, remainingText] = result.stdout.trim().split('|')
  const matched = Number(matchedText) || 0
  const remaining = Number(remainingText) || 0
  if (remaining > 0) {
    console.warn('[GameLaunch] Windows Counter-Strike did not exit after graceful close', {
      matched,
      remaining,
      timeoutMs: WINDOWS_GRACEFUL_CLOSE_TIMEOUT_MS
    })
    throw new Error(
      'Counter-Strike is still running. Close it normally so it can save your settings, then try again.'
    )
  }

  console.info('[GameLaunch] Windows Counter-Strike processes closed gracefully', { matched })
  return matched
}

export const launchCounterStrikeForMatch = (input: MatchLaunchInput): Promise<void> => {
  if (input.forceRestart && forcedLaunchInFlight?.matchId === input.matchId) {
    return forcedLaunchInFlight.promise
  }

  const operation = launchQueue
    .catch(() => undefined)
    .then(async () => {
      matchmakingDiagnostics.record('launch_started', {
        type: 'game_process_launch',
        matchId: input.matchId
      })
      try {
        const settings = await getGameSettings()
        if (standaloneSessionStatus(input.matchId).owned && !input.forceRestart) return
        await shutdownManagedGame()
        await launchStandaloneSession(input.matchId, input.apiUrl, settings, input.onExit)
        matchmakingDiagnostics.record('launch_handoff_completed', {
          type: 'game_process_launch',
          matchId: input.matchId
        })
      } catch (error) {
        matchmakingDiagnostics.record('launch_failed', {
          type: 'game_process_launch',
          matchId: input.matchId
        })
        throw error
      }
    })

  launchQueue = operation.catch(() => undefined)

  if (!input.forceRestart) return operation

  const trackedPromise = operation.finally(() => {
    if (forcedLaunchInFlight?.promise === trackedPromise) forcedLaunchInFlight = null
  })
  forcedLaunchInFlight = { matchId: input.matchId, promise: trackedPromise }
  return trackedPromise
}

export const isCounterStrikeActiveForMatch = (matchId: string): boolean =>
  standaloneSessionStatus(matchId).owned
