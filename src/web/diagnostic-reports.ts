import { validateReportImages, type DiagnosticLogsApi } from '../shared/diagnostic-logs'

type ReportResult = { id: string; createdAt: string }
type Dependencies = {
  session: () => string | null
  post: (body: Record<string, unknown>) => Promise<ReportResult>
  logs: (matchId?: string) => Promise<string>
  prepare: NonNullable<DiagnosticLogsApi['compatibility']>
  upload: (reportId: string, previewId: string) => Promise<void>
}
export function createWebDiagnosticReports(deps: Dependencies): DiagnosticLogsApi {
  return {
    compatibility: deps.prepare,
    get: async () => [],
    async report(description, rendererLogs, matchId, images, compatibilityId) {
      const owner = deps.session()
      if (!owner) throw new Error('Authentication required')
      const helperLogs = await deps
        .logs(matchId)
        .catch(
          () =>
            '[Native helper diagnostics] Unavailable; reconnect the helper to include game logs.'
        )
      if (deps.session() !== owner) throw new Error('COMPATIBILITY_ACCOUNT_CHANGED')
      const report = await deps.post({
        images: validateReportImages(images),
        ...(compatibilityId ? { deduplicationKey: `compatibility:${compatibilityId}` } : {}),
        description,
        ...(matchId ? { matchId } : {}),
        logs: `${rendererLogs.join('\n').slice(-300_000) || '[no renderer logs]'}\n\n${helperLogs}`,
        clientVersion: 'web'
      })
      if (compatibilityId) {
        if (deps.session() !== owner) throw new Error('COMPATIBILITY_ACCOUNT_CHANGED')
        await deps.upload(report.id, compatibilityId)
      }
      return report
    }
  }
}
