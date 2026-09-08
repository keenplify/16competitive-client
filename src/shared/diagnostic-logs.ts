export const DIAGNOSTIC_LOG_CHANNELS = {
  get: 'diagnostic-logs:get'
} as const

export interface DiagnosticLogsApi {
  get: () => Promise<string[]>
}
