import type { CustomGameRoom } from './custom-games'
import type { MatchmakingNode } from './matchmaking'

export const CUSTOM_GAME_LIST_UNAVAILABLE = 'customGames.listUnavailable'

/** Browse the selected region, recovering to the nearest responding region if it disappears. */
export async function loadCustomGameList(
  nodes: MatchmakingNode[],
  selectedNodeId: string | null | undefined,
  load: (node: MatchmakingNode) => Promise<CustomGameRoom[]>
): Promise<CustomGameRoom[]> {
  if (selectedNodeId) {
    const latency = (node: MatchmakingNode): number =>
      typeof node.latencyMs === 'number' && Number.isFinite(node.latencyMs)
        ? node.latencyMs
        : Infinity
    const candidates = [...nodes].sort(
      (left, right) =>
        Number(right.id === selectedNodeId) - Number(left.id === selectedNodeId) ||
        latency(left) - latency(right)
    )
    for (const node of candidates) {
      try {
        // An empty room list is a successful response. Capacity does not prevent browsing.
        return await load(node)
      } catch (error) {
        // Discovery can lag behind an outage. Try the next measured region.
        console.warn('[CustomGames] list request failed', { nodeId: node.id, error })
      }
    }
  } else {
    const results = await Promise.allSettled(nodes.map(load))
    results.forEach((result, index) => {
      if (result.status === 'rejected')
        console.warn('[CustomGames] list request failed', {
          nodeId: nodes[index].id,
          error: result.reason
        })
    })
    const successful = results.filter(
      (result): result is PromiseFulfilledResult<CustomGameRoom[]> => result.status === 'fulfilled'
    )
    if (successful.length > 0) {
      return [
        ...new Map(successful.flatMap(({ value }) => value).map((room) => [room.id, room])).values()
      ]
    }
  }
  throw new Error(CUSTOM_GAME_LIST_UNAVAILABLE)
}
