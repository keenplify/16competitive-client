import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { getSessionToken } from '../auth'
import { API_BASE_URL } from '../config'
import type { Cs16Distribution } from '../game/cs16-installation'
import { isAllowedHlInjectedDll } from './module-whitelist'

const RUNTIME_SCAN_INTERVAL_MS = 15_000
const WINDOWS_PROCESS_DISCOVERY_TIMEOUT_MS = 30_000
const WINDOWS_PROCESS_DISCOVERY_INTERVAL_MS = 750
const MAX_RUNTIME_MODULES = 512
const MAX_UNEXPECTED_MODULE_SIGNALS = 16

// Exact content signatures for injected modules. File names and paths are
// intentionally ignored because they can be changed trivially.
const KNOWN_CHEAT_MODULE_HASHES = new Map<string, string>([
  [
    'ec2dc54f4ca54e7f5df085d96a9e60d41d1277460c7ba831e9786c555a3346ab',
    'KNOWN_OXWARE_106_CHEATER_DLL_HASH'
  ],
  ['fd5ff48d770b04c1c08f9ee42b9ff4bc72bc3f8495b13641a7f0583e65202bc4', 'KNOWN_OPENGL_CHEAT_HASH']
])

const COMMON_EXTERNAL_WINDOWS_MODULES = new Set([
  'gameoverlayrenderer.dll',
  'gameoverlayrenderer64.dll',
  'steamclient.dll',
  'steamclient64.dll',
  'tier0_s.dll',
  'tier0_s64.dll',
  'vstdlib_s.dll',
  'vstdlib_s64.dll',
  'crashhandler.dll',
  'crashhandler64.dll'
])

const COMMON_GAME_WINDOWS_MODULES = new Set([
  'hl.exe',
  'hw.dll',
  'sw.dll',
  'client.dll',
  'filesystem_stdio.dll',
  'steam_api.dll',
  'steam.dll',
  'gameui.dll',
  'vgui.dll',
  'vgui2.dll',
  'sdl2.dll',
  'opengl32.dll',
  'mp.dll'
])

export type AntiCheatSignalSeverity = 'info' | 'warning' | 'high'

export interface AntiCheatSignal {
  code: string
  severity: AntiCheatSignalSeverity
  detail?: string
  sha256?: string
}

export interface AntiCheatFileObservation {
  path: string
  role: 'executable' | 'critical' | 'renderer-wrapper' | 'module'
  status: 'present' | 'missing' | 'unreadable'
  sha256?: string
  size?: number
}

export interface AntiCheatModuleObservation {
  name: string
  pathHint: string
  sha256?: string
}

interface AntiCheatObservation {
  matchId: string
  phase: 'prelaunch' | 'runtime' | 'exit'
  platform: 'win32' | 'linux' | 'other'
  distribution: Cs16Distribution
  processId?: number
  buildFingerprint?: string
  executableSha256?: string
  files: AntiCheatFileObservation[]
  modules: AntiCheatModuleObservation[]
  signals: AntiCheatSignal[]
  exitReason?: string
}

interface AntiCheatSessionOptions {
  matchId: string
  executablePath: string
  gameDirectory: string
  distribution: Cs16Distribution
  onProcessExit?: (processId: number) => void
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

const normalizedPlatform = (): 'win32' | 'linux' | 'other' => {
  if (process.platform === 'win32' || process.platform === 'linux') return process.platform
  return 'other'
}

const sha256File = async (filePath: string): Promise<string> =>
  await new Promise<string>((resolveHash, rejectHash) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', rejectHash)
    stream.once('end', () => resolveHash(hash.digest('hex')))
  })

const knownCheatCodeForHash = (sha256: string | undefined): string | undefined =>
  sha256 ? KNOWN_CHEAT_MODULE_HASHES.get(sha256.toLowerCase()) : undefined

const pathInside = (root: string, filePath: string): boolean => {
  const child = relative(resolve(root), resolve(filePath))
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
}

const normalizedRelative = (root: string, filePath: string): string =>
  relative(resolve(root), resolve(filePath)).split(sep).join('/')

const pathHint = (gameDirectory: string, filePath: string): string => {
  if (pathInside(gameDirectory, filePath))
    return `game:${normalizedRelative(gameDirectory, filePath)}`

  if (process.platform === 'win32') {
    const windowsRoot = process.env.SystemRoot
    if (windowsRoot && pathInside(windowsRoot, filePath)) return `windows:${basename(filePath)}`
  }

  if (
    process.platform === 'linux' &&
    ['/lib/', '/lib64/', '/usr/lib/', '/usr/lib64/'].some((prefix) => filePath.startsWith(prefix))
  ) {
    return `system:${basename(filePath)}`
  }

  return `other:${basename(filePath)}`
}

const inspectFile = async (
  gameDirectory: string,
  filePath: string,
  role: AntiCheatFileObservation['role'],
  missingIsObservation = true
): Promise<AntiCheatFileObservation | null> => {
  const hint = pathHint(gameDirectory, filePath)
  const metadata = await stat(filePath).catch(() => null)
  if (!metadata?.isFile()) {
    return missingIsObservation ? { path: hint, role, status: 'missing' } : null
  }

  try {
    return {
      path: hint,
      role,
      status: 'present',
      sha256: await sha256File(filePath),
      size: metadata.size
    }
  } catch {
    return { path: hint, role, status: 'unreadable', size: metadata.size }
  }
}

const criticalFiles = (
  executablePath: string,
  gameDirectory: string
): Array<{ path: string; role: AntiCheatFileObservation['role']; optional?: boolean }> => {
  const executable = { path: executablePath, role: 'executable' as const }

  if (process.platform === 'win32') {
    return [
      executable,
      { path: join(gameDirectory, 'cstrike', 'cl_dlls', 'client.dll'), role: 'critical' },
      { path: join(gameDirectory, 'hw.dll'), role: 'critical' },
      { path: join(gameDirectory, 'sw.dll'), role: 'critical', optional: true },
      { path: join(gameDirectory, 'filesystem_stdio.dll'), role: 'critical' },
      { path: join(gameDirectory, 'steam_api.dll'), role: 'critical', optional: true },
      { path: join(gameDirectory, 'opengl32.dll'), role: 'renderer-wrapper', optional: true }
    ]
  }

  if (process.platform === 'linux') {
    return [
      executable,
      { path: join(gameDirectory, 'cstrike', 'cl_dlls', 'client.so'), role: 'critical' },
      { path: join(gameDirectory, 'hl_linux'), role: 'executable', optional: true },
      { path: join(gameDirectory, 'hw.so'), role: 'critical', optional: true },
      { path: join(gameDirectory, 'filesystem_stdio.so'), role: 'critical', optional: true },
      { path: join(gameDirectory, 'libGL.so'), role: 'renderer-wrapper', optional: true }
    ]
  }

  return [executable]
}

const collectPrelaunch = async (
  options: AntiCheatSessionOptions
): Promise<Omit<AntiCheatObservation, 'matchId' | 'phase' | 'platform' | 'distribution'>> => {
  const candidates = criticalFiles(options.executablePath, options.gameDirectory)
  const files = (
    await Promise.all(
      candidates.map(({ path, role, optional }) =>
        inspectFile(options.gameDirectory, path, role, optional !== true)
      )
    )
  ).filter((item): item is AntiCheatFileObservation => item !== null)

  const executableObservation = files.find(
    (item) => item.role === 'executable' && item.status === 'present'
  )
  const fingerprintMaterial = files
    .filter((item) => item.status === 'present' && item.sha256)
    .map((item) => `${item.path}:${item.sha256}`)
    .sort()
    .join('\n')
  const signals: AntiCheatSignal[] = files
    .filter(
      (item) =>
        (item.role === 'critical' || item.role === 'executable') && item.status !== 'present'
    )
    .map((item) => ({
      code: item.status === 'missing' ? 'CRITICAL_FILE_MISSING' : 'CRITICAL_FILE_UNREADABLE',
      severity: 'warning' as const,
      detail: `${item.path} is ${item.status}`
    }))

  for (const file of files) {
    const knownCheatCode = knownCheatCodeForHash(file.sha256)
    if (!knownCheatCode) continue
    signals.push({
      code: knownCheatCode,
      severity: 'high',
      sha256: file.sha256,
      detail: `Exact SHA-256 match for a known incompatible file (${file.path}).`
    })
  }

  if (
    process.platform === 'win32' &&
    files.some(
      (item) =>
        item.role === 'renderer-wrapper' &&
        item.status === 'present' &&
        item.path.toLowerCase() === 'game:opengl32.dll'
    )
  ) {
    signals.push({
      code: 'LOCAL_OPENGL_WRAPPER',
      severity: 'high',
      detail:
        'A game-local opengl32.dll is present. Review before treating this as a cheat verdict.'
    })
  }

  return {
    buildFingerprint: fingerprintMaterial
      ? createHash('sha256').update(fingerprintMaterial).digest('hex')
      : undefined,
    executableSha256: executableObservation?.sha256,
    files,
    modules: [],
    signals
  }
}

const runPowerShell = async (
  script: string,
  environment: Record<string, string>
): Promise<{ code: number | null; stdout: string; stderr: string }> =>
  await new Promise((resolveResult) => {
    const executable = process.env.SystemRoot
      ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe'
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Command', script], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...environment }
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.once('error', (error) => resolveResult({ code: null, stdout, stderr: error.message }))
    child.once('exit', (code) => resolveResult({ code, stdout, stderr }))
  })

const windowsModulePaths = async (processId: number): Promise<string[]> => {
  const script = [
    "$targetPid = [int][Environment]::GetEnvironmentVariable('ANTICHEAT_PID')",
    '$target = Get-Process -Id $targetPid -ErrorAction Stop',
    '$modulePaths = @($target.Modules | ForEach-Object { $_.FileName } | Where-Object { $_ })',
    '$modulePaths | ConvertTo-Json -Compress'
  ].join('; ')
  const result = await runPowerShell(script, { ANTICHEAT_PID: String(processId) })
  if (result.code !== 0)
    throw new Error(result.stderr.trim() || 'Windows module enumeration failed')
  const trimmed = result.stdout.trim()
  if (!trimmed) return []
  const parsed = JSON.parse(trimmed) as unknown
  if (typeof parsed === 'string') return [parsed]
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is string => typeof item === 'string')
}

const linuxModulePaths = async (processId: number): Promise<string[]> => {
  const maps = await readFile(`/proc/${processId}/maps`, 'utf8')
  return Array.from(
    new Set(
      maps
        .split('\n')
        .map((line) => line.match(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/)?.[1])
        .filter((item): item is string => Boolean(item?.startsWith('/')))
    )
  )
}

const modulePaths = async (processId: number): Promise<string[]> => {
  if (process.platform === 'win32') return windowsModulePaths(processId)
  if (process.platform === 'linux') return linuxModulePaths(processId)
  return []
}

const shouldHashModule = (gameDirectory: string, filePath: string): boolean => {
  const hint = pathHint(gameDirectory, filePath)
  if (process.platform === 'win32') return !hint.startsWith('windows:')
  if (process.platform === 'linux') return !hint.startsWith('system:')
  return pathInside(gameDirectory, filePath)
}

const isUnexpectedHlDll = (name: string, hint: string): boolean => {
  const lowerName = name.toLowerCase()
  if (!lowerName.endsWith('.dll')) return false
  if (hint.startsWith('windows:')) return false
  if (hint.startsWith('other:')) return !COMMON_EXTERNAL_WINDOWS_MODULES.has(lowerName)
  if (hint.startsWith('game:')) return !COMMON_GAME_WINDOWS_MODULES.has(lowerName)
  return false
}

const collectRuntime = async (
  processId: number,
  gameDirectory: string
): Promise<{ modules: AntiCheatModuleObservation[]; signals: AntiCheatSignal[] }> => {
  let paths: string[]
  try {
    paths = await modulePaths(processId)
  } catch (error) {
    return {
      modules: [],
      signals: [
        {
          code: 'MODULE_ENUMERATION_FAILED',
          severity: 'warning',
          detail: error instanceof Error ? error.message.slice(0, 300) : 'Module enumeration failed'
        }
      ]
    }
  }

  const modules: AntiCheatModuleObservation[] = []
  const signals: AntiCheatSignal[] = []
  let unexpectedSignalCount = 0

  if (paths.length > MAX_RUNTIME_MODULES) {
    signals.push({
      code: 'MODULE_INVENTORY_TRUNCATED',
      severity: 'warning',
      detail: `Counter-Strike reported ${paths.length} loaded modules; the first ${MAX_RUNTIME_MODULES} were captured.`
    })
  }

  for (const filePath of paths.slice(0, MAX_RUNTIME_MODULES)) {
    const name = basename(filePath)
    const hint = pathHint(gameDirectory, filePath)
    let sha256: string | undefined
    if (shouldHashModule(gameDirectory, filePath)) {
      sha256 = await sha256File(filePath).catch(() => undefined)
    }
    modules.push({ name, pathHint: hint, ...(sha256 ? { sha256 } : {}) })

    const knownCheatCode = knownCheatCodeForHash(sha256)
    if (knownCheatCode) {
      signals.push({
        code: knownCheatCode,
        severity: 'high',
        sha256,
        detail: `Exact SHA-256 match for a known incompatible module (${name}).`
      })
    }

    if (
      process.platform === 'win32' &&
      name.toLowerCase() === 'opengl32.dll' &&
      hint.toLowerCase() === 'game:opengl32.dll'
    ) {
      signals.push({
        code: 'GAME_LOCAL_OPENGL_MODULE',
        severity: 'high',
        detail: 'The running game loaded opengl32.dll from the game directory.'
      })
    }

    if (
      process.platform === 'win32' &&
      unexpectedSignalCount < MAX_UNEXPECTED_MODULE_SIGNALS &&
      isUnexpectedHlDll(name, hint) &&
      !isAllowedHlInjectedDll(sha256)
    ) {
      unexpectedSignalCount += 1
      signals.push({
        code: 'HL_INJECTED_DLL',
        severity: 'high',
        ...(sha256 ? { sha256 } : {}),
        detail: `${name} is loaded inside hl.exe but is not part of the expected Windows/GoldSrc/Steam DLL baseline. Review its SHA-256 and match demo.`
      })
    }
  }

  modules.sort((left, right) =>
    `${left.name}:${left.pathHint}`.localeCompare(`${right.name}:${right.pathHint}`)
  )
  return { modules, signals }
}

const reportObservation = async (observation: AntiCheatObservation): Promise<void> => {
  const token = getSessionToken()
  if (!token) return

  try {
    const response = await fetch(`${API_BASE_URL}/auth/anti-cheat/observations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(observation),
      signal: AbortSignal.timeout(5_000)
    })
    if (!response.ok) {
      console.warn('[AntiCheat] observation was not accepted', {
        matchId: observation.matchId,
        phase: observation.phase,
        status: response.status
      })
    }
  } catch (error) {
    console.warn(
      '[AntiCheat] could not report observation',
      error instanceof Error ? error.message : String(error)
    )
  }
}

const processIsAlive = async (processId: number): Promise<boolean> => {
  if (!Number.isInteger(processId) || processId <= 0) return false

  if (process.platform === 'win32') {
    const script = [
      "$targetPid = [int][Environment]::GetEnvironmentVariable('ANTICHEAT_PID')",
      '$target = Get-Process -Id $targetPid -ErrorAction SilentlyContinue',
      'if ($null -eq $target) { exit 1 }',
      'exit 0'
    ].join('; ')
    const result = await runPowerShell(script, { ANTICHEAT_PID: String(processId) })
    return result.code === 0
  }

  if (process.platform === 'linux') {
    return Boolean((await stat(`/proc/${processId}`).catch(() => null))?.isDirectory())
  }

  return true
}

const windowsProcessIdForExecutable = async (executablePath: string): Promise<number | null> => {
  const executableName = basename(executablePath)
  const script = [
    "$target = [Environment]::GetEnvironmentVariable('ANTICHEAT_TARGET_EXE')",
    "$targetName = [Environment]::GetEnvironmentVariable('ANTICHEAT_TARGET_NAME')",
    '$escapedName = $targetName.Replace("\'", "\'\'")',
    '$match = @(Get-CimInstance Win32_Process -Filter "Name=\'$escapedName\'" | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [System.StringComparison]::OrdinalIgnoreCase) } | Sort-Object CreationDate -Descending | Select-Object -First 1)',
    'if ($match.Count -gt 0) { Write-Output $match[0].ProcessId }'
  ].join('; ')
  const result = await runPowerShell(script, {
    ANTICHEAT_TARGET_EXE: executablePath,
    ANTICHEAT_TARGET_NAME: executableName
  })
  if (result.code !== 0) return null
  const processId = Number(result.stdout.trim())
  return Number.isInteger(processId) && processId > 0 ? processId : null
}

export class AntiCheatSession {
  private stopped = false
  private runtimeTimer: NodeJS.Timeout | null = null
  private runtimeExitTimer: NodeJS.Timeout | null = null
  private runtimeProcessId: number | null = null
  private lastRuntimeSignature: string | null = null

  constructor(private readonly options: AntiCheatSessionOptions) {
    void this.reportPrelaunch()
  }

  private baseObservation(): Pick<AntiCheatObservation, 'matchId' | 'platform' | 'distribution'> {
    return {
      matchId: this.options.matchId,
      platform: normalizedPlatform(),
      distribution: this.options.distribution
    }
  }

  private async reportPrelaunch(): Promise<void> {
    const collected = await collectPrelaunch(this.options)
    if (this.stopped) return
    await reportObservation({
      ...this.baseObservation(),
      phase: 'prelaunch',
      ...collected
    })
  }

  attachProcess(processId: number): void {
    if (this.stopped || !Number.isInteger(processId) || processId <= 0) return
    this.runtimeProcessId = processId
    this.lastRuntimeSignature = null
    if (this.runtimeTimer) clearInterval(this.runtimeTimer)
    if (this.runtimeExitTimer) clearInterval(this.runtimeExitTimer)
    setTimeout(() => void this.reportRuntime(), 1_000).unref?.()
    this.runtimeTimer = setInterval(() => void this.reportRuntime(), RUNTIME_SCAN_INTERVAL_MS)
    this.runtimeTimer.unref?.()
    this.runtimeExitTimer = setInterval(() => void this.checkProcessExit(processId), 1_500)
    this.runtimeExitTimer.unref?.()
  }

  private async checkProcessExit(processId: number): Promise<void> {
    if (this.stopped || this.runtimeProcessId !== processId) return
    if (await processIsAlive(processId)) return
    if (this.runtimeProcessId !== processId || this.stopped) return

    this.runtimeProcessId = null
    if (this.runtimeTimer) clearInterval(this.runtimeTimer)
    this.runtimeTimer = null
    if (this.runtimeExitTimer) clearInterval(this.runtimeExitTimer)
    this.runtimeExitTimer = null

    try {
      this.options.onProcessExit?.(processId)
    } catch (error) {
      console.warn('[AntiCheat] managed process exit callback failed', {
        matchId: this.options.matchId,
        processId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async attachWhenWindowsProcessAppears(executablePath: string): Promise<void> {
    if (process.platform !== 'win32') return
    const deadline = Date.now() + WINDOWS_PROCESS_DISCOVERY_TIMEOUT_MS
    while (!this.stopped && Date.now() < deadline) {
      const processId = await windowsProcessIdForExecutable(executablePath)
      if (processId) {
        this.attachProcess(processId)
        return
      }
      await delay(WINDOWS_PROCESS_DISCOVERY_INTERVAL_MS)
    }

    if (!this.stopped) {
      await reportObservation({
        ...this.baseObservation(),
        phase: 'runtime',
        files: [],
        modules: [],
        signals: [
          {
            code: 'GAME_PROCESS_NOT_FOUND',
            severity: 'warning',
            detail: 'The selected Counter-Strike process was not found after launcher handoff.'
          }
        ]
      })
    }
  }

  private async reportRuntime(): Promise<void> {
    const processId = this.runtimeProcessId
    if (this.stopped || !processId) return
    const collected = await collectRuntime(processId, this.options.gameDirectory)
    if (this.stopped || this.runtimeProcessId !== processId) return
    const signature = createHash('sha256').update(JSON.stringify(collected)).digest('hex')
    if (signature === this.lastRuntimeSignature) return
    this.lastRuntimeSignature = signature

    await reportObservation({
      ...this.baseObservation(),
      phase: 'runtime',
      processId,
      files: [],
      ...collected
    })
  }

  stop(reason: string): void {
    if (this.stopped) return
    this.stopped = true
    if (this.runtimeTimer) clearInterval(this.runtimeTimer)
    this.runtimeTimer = null
    if (this.runtimeExitTimer) clearInterval(this.runtimeExitTimer)
    this.runtimeExitTimer = null
    const processId = this.runtimeProcessId ?? undefined
    this.runtimeProcessId = null
    void reportObservation({
      ...this.baseObservation(),
      phase: 'exit',
      processId,
      files: [],
      modules: [],
      signals: [],
      exitReason: reason.slice(0, 120)
    })
  }
}

export const startAntiCheatSession = (options: AntiCheatSessionOptions): AntiCheatSession =>
  new AntiCheatSession(options)
