import { app } from 'electron'
import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'

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

export async function reportDiagnosticIssue(description: string, rendererLogs: string[]) {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in again before reporting an issue.')
  const logs = [...entries, ...rendererLogs].join('\n').slice(-500_000)
  const response = await fetch(`${API_BASE_URL}/auth/issue-reports`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      description,
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
