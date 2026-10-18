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

export const getRendererDiagnosticLogs = (): string[] => [
  ...entries,
  `[RendererContext] ${JSON.stringify({
    // Keep query parameters and fragments out of reports: they can contain credentials.
    screen: window.location.protocol === 'file:' ? 'desktop' : window.location.pathname,
    visibility: document.visibilityState
  })}`
]
import { serverClockNow } from '../../shared/server-clock'
