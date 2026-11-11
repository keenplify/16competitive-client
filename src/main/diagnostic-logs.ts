import type { ReportImage } from '../shared/diagnostic-logs'
import { app } from 'electron'
import { LegacyGameService } from './game/legacy-game-service'
import { dirname, join } from 'node:path'
import { getSavedCs16Executable } from './game/game-settings'
import { getSessionPlayerId, getSessionToken, getSessionUsername } from './auth'
import { gamePerformanceReport, refreshGamePerformance } from './game/game-performance'
import { API_BASE_URL } from './config'
import { serverClockNow } from '../shared/server-clock'
import { collectGameConsoleLogs, redactReportLogs } from './game/game-console-logs'
import { readMatchLaunchDiagnostics } from './game/match-launch-diagnostics'
import { postDiagnosticReport } from './diagnostic-report-request'
import { matchmakingDiagnostics } from './matchmaking-diagnostics'
import { musicDeliveryReport } from './game/music-diagnostics'
import { nativeLaunchReport } from './game/native-launch-diagnostics'
import {
  prepareCompatibilityFiles,
  getCompatibilityFiles,
  uploadCompatibilityFiles
} from './compatibility-files'

export async function previewCompatibilityFiles(game: 'cs16' | 'cs13' = 'cs16') {
  const owner = getSessionToken()
  if (!owner) throw new Error('COMPATIBILITY_ACCOUNT_CHANGED')
  let root: string
  let platform: string = process.platform
  if (game === 'cs13') {
    const profile = await new LegacyGameService({
      settingsPath: join(app.getPath('userData'), 'cs13-installation.json'),
      platform: process.platform,
      chooseFolder: async () => null,
      isBusy: () => false,
      launch: async () => undefined
    }).get()
    if (!profile.ok || !profile.value.installation)
      throw new Error('COMPATIBILITY_FILES_UNAVAILABLE')
    root = profile.value.installation.folderPath
    if (profile.value.installation.runtime === 'wine') platform = 'win32'
  } else {
    const executable = await getSavedCs16Executable()
    if (!executable) throw new Error('COMPATIBILITY_FILES_UNAVAILABLE')
    root = dirname(executable)
  }
  const result = await prepareCompatibilityFiles(root, owner, game, platform)
  if (owner !== getSessionToken()) throw new Error('COMPATIBILITY_ACCOUNT_CHANGED')
  return result
}

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
  images?: ReportImage[],
  compatibilityId?: string
) {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in again before reporting an issue.')
  const compatibility = compatibilityId ? getCompatibilityFiles(compatibilityId, token) : undefined
  if (compatibilityId) deduplicationKey = `compatibility:${compatibilityId}`
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
  const report = (await response.json()) as { id: string; createdAt: string }
  if (compatibility) {
    if (!/^[a-f0-9-]{36}$/i.test(report.id)) throw new Error('INVALID_REPORT_RESPONSE')
    await uploadCompatibilityFiles(
      apiUrl,
      token,
      report.id,
      compatibility,
      () => token === getSessionToken()
    )
  }
  return report
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
  const nativeLaunch = await nativeLaunchReport(musicDirectory, getSessionPlayerId(), matchId)
  return `${redactReportLogs(environment)}\n\n${nativeLaunch}\n\n${matchmaking}\n\n${launchHistory}\n\n${performance}\n\n${music}\n\n${launchContext}\n\n${launcherLogs}\n\n${gameLogs}`.slice(
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
