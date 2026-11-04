/** Schedule once per folder/session; serialize folder changes and retry failures later. */
export function createEarlyAssetSync(): (
  folder: string | null,
  session: string | null,
  sync: () => Promise<void>
) => Promise<void> {
  let last: { folder: string; session: string; task: Promise<void>; retryAt: number } | null = null
  let pending: Promise<void> = Promise.resolve()
  return (folder, session, sync) => {
    if (!folder || !session) return Promise.resolve()
    if (last?.folder === folder && last.session === session && Date.now() < last.retryAt)
      return last.task
    const entry = { folder, session, task: Promise.resolve(), retryAt: Infinity }
    entry.task = pending
      .catch(() => undefined)
      .then(sync)
      .catch((error: unknown) => {
        entry.retryAt = Date.now() + 30_000
        throw error
      })
    pending = entry.task
    last = entry
    return entry.task
  }
}
