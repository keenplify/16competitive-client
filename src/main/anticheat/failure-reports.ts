import { app } from 'electron'
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { release } from 'node:os'
import helperRelease from '../../../helper-release.json'
import { resolveServiceApiUrl } from '../matchmaking-regions'
import { getSessionToken, getSessionUsername } from '../auth'
import { reportDiagnosticIssue } from '../diagnostic-logs'
import { redactReportLogs } from '../game/game-console-logs'
import { writeLiveSessionFile } from '../game/live-session-file'
import { FailureReportQueue, parseFailureReports } from './failure-report-queue'

export type AntiCheatFailureStage =
  | 'app-verification'
  | 'periodic-verification'
  | 'session-start'
  | 'startup-timeout'
  | 'process-error'
  | 'unexpected-exit'
  | 'control-channel'
  | 'invalid-protocol'
  | 'heartbeat-timeout'
  | 'session-verification'
  | 'recovery-exhausted'

const path = (): string => join(app.getPath('userData'), 'anticheat-failure-reports.json')
const queue = new FailureReportQueue({
  async read() {
    try {
      const info = await lstat(path())
      if (!info.isFile() || info.size > 256_000) return []
      return parseFailureReports(await readFile(path(), 'utf8'), Date.now())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn('[AntiCheatReport] could not read pending reports')
      return []
    }
  },
  write: (reports) => writeLiveSessionFile(path(), JSON.stringify(reports))
})

export async function flushAntiCheatFailureReports(): Promise<void> {
  try {
    if (!getSessionToken()) return
    const apiUrl = await resolveServiceApiUrl()
    await queue.flush(
      () => (getSessionToken() ? getSessionUsername() : null),
      (report) =>
        reportDiagnosticIssue(
          report.description,
          [report.details],
          report.key,
          report.matchId,
          apiUrl
        )
    )
  } catch {
    console.warn('[AntiCheatReport] submission unavailable; retained for retry')
  }
}

/** Persist before app quit; upload asynchronously without delaying game shutdown. */
export async function recordAntiCheatFailure(
  stage: AntiCheatFailureStage,
  context: {
    apiUrl?: string
    matchId?: string
    distribution?: string
    restartCount?: number
    exitCode?: number | null
    signal?: string | null
    error?: unknown
  } = {}
): Promise<void> {
  try {
    const error = context.error instanceof Error ? context.error : null
    const token = getSessionToken()
    const sanitize = (text: string): string =>
      redactReportLogs(
        (token ? text.split(token).join('[redacted]') : text).replace(
          /Bearer\s+[^\s"']+/gi,
          'Bearer [redacted]'
        )
      ).slice(0, 600)
    const cause = error?.cause instanceof Error ? error.cause : null
    const at = Date.now()
    const owner = getSessionUsername()
    const apiOrigin = context.apiUrl
      ? new URL(context.apiUrl).origin
      : error && 'apiOrigin' in error
        ? String(error.apiOrigin)
        : undefined
    const details = {
      stage,
      occurredAt: new Date(at).toISOString(),
      clientVersion: app.getVersion(),
      helperVersion: helperRelease.version,
      platform: process.platform,
      architecture: process.arch,
      osRelease: release(),
      apiOrigin,
      approvalOrigin: apiOrigin,
      approvalTimeoutMs: 5000,
      matchId: context.matchId,
      distribution: context.distribution,
      restartCount: context.restartCount,
      exitCode: context.exitCode,
      signal: context.signal,
      cause: cause
        ? {
            name: sanitize(cause.name),
            message: sanitize(cause.message),
            code:
              typeof (cause as NodeJS.ErrnoException).code === 'string'
                ? sanitize((cause as NodeJS.ErrnoException).code!)
                : undefined
          }
        : undefined,
      error: error
        ? {
            name: sanitize(error.name),
            message: sanitize(error.message),
            code:
              typeof (error as NodeJS.ErrnoException).code === 'string'
                ? sanitize((error as NodeJS.ErrnoException).code!)
                : undefined
          }
        : undefined
    }
    const key =
      'anticheat:' +
      createHash('sha256')
        .update(
          JSON.stringify([
            owner,
            stage,
            context.matchId,
            app.getVersion(),
            helperRelease.version,
            Math.floor(at / 3_600_000)
          ])
        )
        .digest('hex')
    await queue.enqueue({
      key,
      at,
      owner,
      matchId: context.matchId,
      description: `Automatic anti-cheat failure: ${stage}.\nOccurred: ${details.occurredAt}\nLauncher: ${details.clientVersion}; helper: ${details.helperVersion}.\n${context.matchId ? 'Match ID: ' + context.matchId + '\n' : ''}Operational failure; this report is not a cheating verdict.`,
      details: JSON.stringify({ antiCheatFailure: details })
    })
    console.info('[AntiCheatReport] failure saved', { stage, matchId: context.matchId })
  } catch {
    console.warn('[AntiCheatReport] could not persist failure report', { stage })
  }
}

export function reportAntiCheatFailure(
  stage: AntiCheatFailureStage,
  context: Parameters<typeof recordAntiCheatFailure>[1] = {}
): void {
  void recordAntiCheatFailure(stage, context).then(() => flushAntiCheatFailureReports())
}
