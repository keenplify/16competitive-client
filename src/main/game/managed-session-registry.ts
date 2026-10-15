// Extra game adapters participate in the existing serialized launch/shutdown
// flow without importing one another or transferring ownership to a stock game.
const shutdowns = new Set<() => Promise<void>>()
export function registerManagedAdapterShutdown(shutdown: () => Promise<void>): void {
  shutdowns.add(shutdown)
}
export async function shutdownManagedAdapters(): Promise<void> {
  for (const shutdown of shutdowns) await shutdown()
}
