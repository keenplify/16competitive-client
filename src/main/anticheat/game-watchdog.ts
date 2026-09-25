import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

interface ActiveGameWatchdog {
  matchId: string
  executablePath: string
  child: ChildProcess
  stopping: boolean
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
    '$launcher = Get-Process -Id $launcherPid -ErrorAction SilentlyContinue',
    'if ($null -eq $launcher) { exit 2 }',
    'while (-not $launcher.HasExited) { Start-Sleep -Milliseconds 500; $launcher.Refresh() }',
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
  // The launcher starts Counter-Strike in its own process group, so the watchdog
  // stops the whole group: the game may sit behind a launcher script or an
  // emulation wrapper (box64, FEX, Proton, microVM setups) where the game binary
  // itself is not the process the launcher can see. It falls back to the single
  // process when the target is not a group leader.
  const script = [
    'launcher_pid="$1"',
    'target_exe="$2"',
    'stop_group() {',
    '  kill -TERM -- "-$1" 2>/dev/null || kill -TERM "$1" 2>/dev/null || true',
    '}',
    'while kill -0 "$launcher_pid" 2>/dev/null; do sleep 1; done',
    'for proc in /proc/[0-9]*; do',
    '  pid="${proc##*/}"',
    // The watchdog's own command line contains the target path, so it must never
    // signal itself before it has walked the rest of the process table.
    '  if [ "$pid" = "$$" ]; then',
    '    continue',
    '  fi',
    '  current="$(readlink "$proc/exe" 2>/dev/null || true)"',
    '  if [ "$current" = "$target_exe" ]; then',
    '    stop_group "$pid"',
    '    continue',
    '  fi',
    `  cmdline="$(cat "$proc/cmdline" 2>/dev/null | tr '\\0' ' ' || true)"`,
    '  case "$cmdline" in',
    '    *"$target_exe"*) stop_group "$pid" ;;',
    '  esac',
    'done'
  ].join('\n')

  return spawn(
    '/bin/sh',
    ['-c', script, '16competitive-watchdog', String(process.pid), executablePath],
    {
      detached: true,
      shell: false,
      stdio: 'ignore'
    }
  )
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
    stopping: false
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
    activeWatchdog = null
    console.warn(
      '[AntiCheat] launcher watchdog exited before the launcher closed; it will not restart automatically',
      {
        matchId,
        code,
        signal
      }
    )
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
  try {
    state.child.kill()
  } catch {
    // The watchdog may already have exited.
  }
}
