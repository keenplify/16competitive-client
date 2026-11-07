import type { ReportImage } from '../shared/diagnostic-logs'
import { app } from 'electron'
import { dirname, join } from 'node:path'
import { getSavedCs16Executable } from './game/game-settings'
import { getSessionToken, getSessionUsername } from './auth'
import { gamePerformanceReport, refreshGamePerformance } from './game/game-performance'
import { API_BASE_URL } from './config'
import { serverClockNow } from '../shared/server-clock'
import { collectGameConsoleLogs, redactReportLogs } from './game/game-console-logs'
import { readMatchLaunchDiagnostics } from './game/match-launch-diagnostics'
import { postDiagnosticReport } from './diagnostic-report-request'
import { matchmakingDiagnostics } from './matchmaking-diagnostics'
import { musicDeliveryReport } from './game/music-diagnostics'

const MAX_LOG_ENTRIES = 2000
const entries: string[] = []

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export const getDiagnosticLogs = (): string[] => [...entries]

export async function reportDiagnosticIssue(
  description: string,
  rendererLogs: string[],
  deduplicationKey?: string,
  matchId?: string,
  apiUrl = API_BASE_URL,
  images?: ReportImage[]
) {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in again before reporting an issue.')
  const logs = await collectDiagnosticIssueLogs(rendererLogs, matchId)
  if (token !== getSessionToken()) throw new Error('Sign in again before reporting an issue.')
  const response = await postDiagnosticReport(apiUrl, token, {
    description,
    images,
    ...(deduplicationKey ? { deduplicationKey } : {}),
    ...(matchId ? { matchId } : {}),
    logs: logs || 'No diagnostic logs recorded.',
    clientVersion: app.getVersion()
  })
  if (!response.ok) {
    const failure = await response.json().catch(() => null)
    if (failure?.error === 'INVALID_REPORT_IMAGES') throw new Error('INVALID_REPORT_IMAGES')
    throw new Error(`Could not report issue (${response.status}).`)
  }
  return (await response.json()) as { id: string; createdAt: string }
}

export async function collectDiagnosticIssueLogs(
  rendererLogs: string[],
  matchId?: string
): Promise<string> {
  matchmakingDiagnostics.setOwner(getSessionUsername())
  const matchmaking = `[Main matchmaking diagnostics]\n${matchmakingDiagnostics.report()}`
  const launchHistory = `[Saved launch history]\n${await matchmakingDiagnostics.historyReport()}`
  const environment = `[Launcher environment] ${JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    sessionType: process.env.XDG_SESSION_TYPE?.slice(0, 80),
    desktop: process.env.XDG_CURRENT_DESKTOP?.slice(0, 80),
    clientVersion: app.getVersion()
  })}`
  const launcherLogs = redactReportLogs([...entries, ...rendererLogs].join('\n')).slice(-300_000)
  const savedExecutable = await getSavedCs16Executable().catch((error: unknown) => {
    console.warn('[IssueReport] Could not resolve saved game installation:', error)
    return null
  })
  const fallbackDirectory = savedExecutable ? dirname(savedExecutable) : undefined
  const gameLogs = await collectGameConsoleLogs(fallbackDirectory)
  const launchContext = matchId
    ? await readMatchLaunchDiagnostics(
        join(app.getPath('userData'), 'match-launch-diagnostics'),
        matchId
      )
    : ''
  const owner = getSessionUsername() ?? ''
  await refreshGamePerformance(owner, matchId)
  const performance = gamePerformanceReport(owner, matchId)
  const musicDirectory =
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, '16competitive')
      : join(app.getPath('appData'), '16competitive')
  const music = await musicDeliveryReport(musicDirectory, matchId)
  return `${redactReportLogs(environment)}\n\n${matchmaking}\n\n${launchHistory}\n\n${performance}\n\n${music}\n\n${launchContext}\n\n${launcherLogs}\n\n${gameLogs}`.slice(
    0,
    500_000
  )
}

export function installDiagnosticLogCapture(): void {
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      entries.push(
        `${new Date(serverClockNow()).toISOString()} [${level}] ${args.map(formatValue).join(' ')}`
      )
      if (entries.length > MAX_LOG_ENTRIES) entries.shift()
      original(...args)
    }
  }
}
