import type { MatchmakingNode } from '../../../../shared/matchmaking'

type MatchmakingNodeWithLatency = MatchmakingNode & { latencyMs?: number | null }

export const nodeLatency = (node: MatchmakingNodeWithLatency): number | null =>
  typeof node.latencyMs === 'number' && Number.isFinite(node.latencyMs)
    ? Math.max(0, Math.round(node.latencyMs))
    : null

export const displayedPlayWindowNode = (
  nodes: MatchmakingNode[],
  selectedNodeId: string | null
): MatchmakingNode | null => {
  if (selectedNodeId) return nodes.find((node) => node.id === selectedNodeId) ?? null
  return (
    [...nodes]
      .filter((node) => node.available && nodeLatency(node) !== null)
      .sort(
        (left, right) => (nodeLatency(left) ?? Infinity) - (nodeLatency(right) ?? Infinity)
      )[0] ?? null
  )
}
