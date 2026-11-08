export type ReportImage = { mime: 'image/png' | 'image/jpeg' | 'image/webp'; data: string }
export function validateReportImages(value: unknown): ReportImage[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 3) throw new Error('INVALID_REPORT_IMAGES')
  for (const image of value) {
    if (
      !image ||
      typeof image !== 'object' ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) ||
      typeof image.data !== 'string' ||
      image.data.length < 4 ||
      image.data.length > 2796204 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
    )
      throw new Error('INVALID_REPORT_IMAGES')
  }
  return value as ReportImage[]
}

export const DIAGNOSTIC_LOG_CHANNELS = {
  compatibility: 'diagnostic-logs:compatibility',
  get: 'diagnostic-logs:get',
  report: 'diagnostic-logs:report'
} as const

export interface DiagnosticLogsApi {
  compatibility?: () => Promise<CompatibilityPreview>
  get: () => Promise<string[]>
  report: (
    description: string,
    rendererLogs: string[],
    matchId?: string,
    images?: ReportImage[],
    compatibilityId?: string
  ) => Promise<{ id: string; createdAt: string }>
}

export type CompatibilityPreview = {
  id: string
  files: { path: string; sha256: string; size: number }[]
  totalBytes: number
}
