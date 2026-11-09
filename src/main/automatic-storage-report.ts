type StorageFailure = { matchId: string; error: unknown; apiUrl: string }
type Report = (
  description: string,
  logs: string[],
  key: string,
  matchId: string,
  apiUrl: string
) => Promise<unknown>

/** Report only denied launch filesystem operations, without delaying the launch error. */
export function createAutomaticStorageReporter(
  report: Report,
  owner: () => string | null,
  wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
): (event: StorageFailure) => Promise<void> {
  const submitted = new Set<string>()
  return async ({ matchId, error, apiUrl }) => {
    if (!(error instanceof Error)) return
    const cause = error.cause ?? error
    const detail = typeof cause === 'object' && cause !== null ? cause : {}
    const code = 'code' in detail ? String(detail.code) : ''
    if (
      error.message !== 'match.assets.storageDenied' &&
      !['EACCES', 'EPERM', 'EROFS'].includes(code)
    )
      return
    const account = owner()
    if (!account) return
    const key = `match-storage-denied:${matchId}`
    const localKey = JSON.stringify([account, key])
    if (submitted.has(localKey)) return
    submitted.add(localKey)
    // Bound session memory; the server also deduplicates reports per account.
    if (submitted.size > 128) submitted.delete(submitted.values().next().value!)
    const syscall =
      'syscall' in detail && /^[a-zA-Z0-9_]{1,40}$/.test(String(detail.syscall))
        ? String(detail.syscall)
        : 'unavailable'
    const file =
      'path' in detail && typeof detail.path === 'string'
        ? detail.path.split(/[\\/]/).pop()
        : undefined
    const filename = file && /^[a-zA-Z0-9_. -]{1,120}$/.test(file) ? file : 'unavailable'
    const description = [
      'Automatic bug report: game launch blocked by filesystem permissions.',
      `Match ID: ${matchId}`,
      `Filesystem code: ${['EACCES', 'EPERM', 'EROFS'].includes(code) ? code : 'unavailable'}`,
      `Operation: ${syscall}`,
      `Target name: ${filename}`,
      'Launcher diagnostics are attached. No compatibility files were requested.'
    ].join('\n')
    for (let attempt = 0; attempt < 3; attempt++) {
      // Never retry a previous account's report after sign-out/account switching.
      if (owner() !== account) {
        submitted.delete(localKey)
        return
      }
      try {
        await report(description, [], key, matchId, apiUrl)
        console.info('[IssueReport] automatic storage failure report submitted', { matchId })
        return
      } catch {
        if (attempt < 2) await wait(1000 * (attempt + 1))
        else {
          submitted.delete(localKey)
          console.warn('[IssueReport] automatic storage failure report failed', { matchId })
        }
      }
    }
  }
}
