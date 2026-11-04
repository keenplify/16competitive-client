import type { ReportImage } from '../shared/diagnostic-logs'
type DiagnosticReportBody = {
  images?: ReportImage[]
  description: string
  deduplicationKey?: string
  matchId?: string
  logs: string
  clientVersion: string
}

export async function postDiagnosticReport(
  apiUrl: string,
  token: string,
  body: DiagnosticReportBody,
  request: typeof fetch = fetch
): Promise<Response> {
  const post = (payload: DiagnosticReportBody): Promise<Response> =>
    request(`${apiUrl}/auth/issue-reports`, {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000)
    })
  const response = await post(body)
  if (response.status !== 403 || !body.matchId) return response
  const rejection: unknown = await response
    .clone()
    .json()
    .catch(() => null)
  if (
    !rejection ||
    typeof rejection !== 'object' ||
    !('error' in rejection) ||
    rejection.error !== 'MATCH_ACCESS_DENIED'
  )
    return response

  // Public Arena/FFA membership is recorded only after game authentication.
  // A failed join must still be reportable, without granting access to the match.
  const { matchId, ...unlinked } = body
  return post({
    ...unlinked,
    logs: `[Unlinked launch attempt: ${matchId}; match membership not verified]\n${body.logs}`.slice(
      0,
      500_000
    )
  })
}
