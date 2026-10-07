import { app } from 'electron'
import { dirname, join } from 'node:path'
import { getSavedCs16Executable } from './game/game-settings'
import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import { collectGameConsoleLogs, redactReportLogs } from './game/game-console-logs'
import { readMatchLaunchDiagnostics } from './game/match-launch-diagnostics'

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
  matchId?: string
) {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in again before reporting an issue.')
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
  const logs = `${launchContext}\n\n${launcherLogs}\n\n${gameLogs}`
  const response = await fetch(`${API_BASE_URL}/auth/issue-reports`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      description,
      ...(deduplicationKey ? { deduplicationKey } : {}),
      ...(matchId ? { matchId } : {}),
      logs: logs || 'No diagnostic logs recorded.',
      clientVersion: app.getVersion()
    }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`Could not report issue (${response.status}).`)
  return (await response.json()) as { id: string; createdAt: string }
}

export function installDiagnosticLogCapture(): void {
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      entries.push(`${new Date().toISOString()} [${level}] ${args.map(formatValue).join(' ')}`)
      if (entries.length > MAX_LOG_ENTRIES) entries.shift()
      original(...args)
    }
  }
}
