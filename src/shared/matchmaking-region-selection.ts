import type { MatchmakingNode } from './matchmaking'

export const HIGH_PING_THRESHOLD_MS = 300
export const AUTOMATIC_REGION_PING_THRESHOLD_MS = 150

export function nearbyMatchmakingNodes(
  nodes: MatchmakingNode[],
  maxPingMs = AUTOMATIC_REGION_PING_THRESHOLD_MS
): MatchmakingNode[] {
  return nodes
    .filter(
      (node) =>
        node.available &&
        typeof node.latencyMs === 'number' &&
        Number.isFinite(node.latencyMs) &&
        node.latencyMs >= 0 &&
        node.latencyMs < maxPingMs
    )
    .sort((a, b) => a.latencyMs! - b.latencyMs!)
}

export function matchmakingRegionSelection(
  nodes: MatchmakingNode[],
  selectedNodeId: string | null,
  allowRegionExpansion: boolean
): { preferredNode: MatchmakingNode | undefined; eligibleRegions: string[]; nearby: boolean } {
  const available = nearbyMatchmakingNodes(nodes)
  const selected = selectedNodeId
    ? nearbyMatchmakingNodes(nodes, HIGH_PING_THRESHOLD_MS).find(
        (node) => node.id === selectedNodeId
      )
    : undefined
  // A manual region must never silently become a different continent during a restart.
  const preferredNode = selectedNodeId ? selected : available[0]
  const nearby = !selectedNodeId || allowRegionExpansion
  return {
    preferredNode,
    nearby,
    eligibleRegions: [
      ...new Set(
        (preferredNode ? (nearby ? [preferredNode, ...available] : [preferredNode]) : []).map(
          (node) => node.region
        )
      )
    ]
  }
}
