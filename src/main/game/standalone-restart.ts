/** A single file write can produce multiple Windows watcher notifications.
 * Keep success and failure sticky: replaying a partial handoff can release or
 * clean a newer game session. Recovery failure must remain visible to callers.
 */
export function createStandaloneRestartHandoff(handoff: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined
  return () => (pending ??= Promise.resolve().then(handoff))
}
