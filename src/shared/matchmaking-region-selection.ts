import type { MatchmakingNode } from './matchmaking'

export const HIGH_PING_THRESHOLD_MS = 300

export function nearbyMatchmakingNodes(nodes: MatchmakingNode[]): MatchmakingNode[] {
  return nodes
    .filter(
      (node) =>
        node.available &&
        typeof node.latencyMs === 'number' &&
        Number.isFinite(node.latencyMs) &&
        node.latencyMs >= 0 &&
        node.latencyMs < HIGH_PING_THRESHOLD_MS
    )
    .sort((a, b) => a.latencyMs! - b.latencyMs!)
}

export function matchmakingRegionSelection(
  nodes: MatchmakingNode[],
  selectedNodeId: string | null,
  allowRegionExpansion: boolean
): { preferredNode: MatchmakingNode | undefined; eligibleRegions: string[]; nearby: boolean } {
  const available = nearbyMatchmakingNodes(nodes)
  const selected = available.find((node) => node.id === selectedNodeId)
  const preferredNode = selected ?? available[0]
  const nearby = !selectedNodeId || allowRegionExpansion
  return {
    preferredNode,
    nearby,
    eligibleRegions: [
      ...new Set(
        (nearby ? available : preferredNode ? [preferredNode] : []).map((node) => node.region)
      )
    ]
  }
}
