export const DIAGNOSTIC_LOG_CHANNELS = {
  get: 'diagnostic-logs:get',
  report: 'diagnostic-logs:report'
} as const

export interface DiagnosticLogsApi {
  get: () => Promise<string[]>
  report: (
    description: string,
    rendererLogs: string[]
  ) => Promise<{ id: string; createdAt: string }>
}
