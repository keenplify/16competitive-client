import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

interface ActiveGameWatchdog {
  matchId: string
  executablePath: string
  child: ChildProcess
  stopping: boolean
  restartTimer: NodeJS.Timeout | null
}

let activeWatchdog: ActiveGameWatchdog | null = null

const powershellExecutable = (): string =>
  process.env.SystemRoot
    ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'

const spawnWindowsWatchdog = (executablePath: string): ChildProcess => {
  const script = [
    "$launcherPid = [int][Environment]::GetEnvironmentVariable('ANTICHEAT_LAUNCHER_PID')",
    "$targetExe = [Environment]::GetEnvironmentVariable('ANTICHEAT_TARGET_EXE')",
    'Wait-Process -Id $launcherPid -ErrorAction SilentlyContinue',
    '$matches = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $targetExe, [System.StringComparison]::OrdinalIgnoreCase) })',
    '$matches | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  ].join('; ')

  return spawn(
    powershellExecutable(),
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
    {
      detached: true,
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
      env: {
        ...process.env,
        ANTICHEAT_LAUNCHER_PID: String(process.pid),
        ANTICHEAT_TARGET_EXE: executablePath
      }
    }
  )
}

const spawnLinuxWatchdog = (executablePath: string): ChildProcess => {
  const script = [
    'launcher_pid="$1"',
    'target_exe="$2"',
    'while kill -0 "$launcher_pid" 2>/dev/null; do sleep 1; done',
    'for proc in /proc/[0-9]*; do',
    '  current="$(readlink "$proc/exe" 2>/dev/null || true)"',
    '  if [ "$current" = "$target_exe" ]; then',
    '    pid="${proc##*/}"',
    '    kill -TERM "$pid" 2>/dev/null || true',
    '  fi',
    'done'
  ].join('\n')

  return spawn('/bin/sh', ['-c', script, '16competitive-watchdog', String(process.pid), executablePath], {
    detached: true,
    shell: false,
    stdio: 'ignore'
  })
}

const spawnWatchdog = (executablePath: string): ChildProcess | null => {
  if (process.platform === 'win32') return spawnWindowsWatchdog(executablePath)
  if (process.platform === 'linux') return spawnLinuxWatchdog(executablePath)
  return null
}

const armWatchdog = (matchId: string, executablePath: string): void => {
  const child = spawnWatchdog(executablePath)
  if (!child) {
    console.warn('[AntiCheat] launcher watchdog is not supported on this platform', {
      matchId,
      platform: process.platform
    })
    return
  }

  const state: ActiveGameWatchdog = {
    matchId,
    executablePath,
    child,
    stopping: false,
    restartTimer: null
  }
  activeWatchdog = state
  child.unref()

  console.info('[AntiCheat] launcher watchdog armed', {
    matchId,
    watchdogPid: child.pid,
    launcherPid: process.pid,
    platform: process.platform
  })

  child.once('error', (error) => {
    console.warn('[AntiCheat] launcher watchdog error', {
      matchId,
      error: error.message
    })
  })

  child.once('exit', (code, signal) => {
    if (activeWatchdog !== state || state.stopping) return
    console.warn('[AntiCheat] launcher watchdog exited unexpectedly; respawning', {
      matchId,
      code,
      signal
    })
    state.restartTimer = setTimeout(() => {
      if (activeWatchdog !== state || state.stopping) return
      activeWatchdog = null
      armWatchdog(matchId, executablePath)
    }, 500)
    state.restartTimer.unref?.()
  })
}

export const startGameWatchdog = (matchId: string, executablePath: string): void => {
  stopGameWatchdog()
  armWatchdog(matchId, executablePath)
}

export const stopGameWatchdog = (matchId?: string): void => {
  const state = activeWatchdog
  if (!state || (matchId && state.matchId !== matchId)) return
  activeWatchdog = null
  state.stopping = true
  if (state.restartTimer) clearTimeout(state.restartTimer)
  state.restartTimer = null
  try {
    state.child.kill()
  } catch {
    // The watchdog may already have exited.
  }
}
