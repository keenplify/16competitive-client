export interface NativeVoicePreferences {
  enabled: boolean
  openMic: boolean
  peers: Record<string, { muted: boolean; volume: number }>
}

export function parseNativeVoicePreferences(value: unknown): NativeVoicePreferences {
  if (!value || typeof value !== 'object') throw new Error('Invalid voice preferences')
  const candidate = value as NativeVoicePreferences
  if (
    typeof candidate.enabled !== 'boolean' ||
    typeof candidate.openMic !== 'boolean' ||
    !candidate.peers ||
    typeof candidate.peers !== 'object' ||
    Array.isArray(candidate.peers)
  )
    throw new Error('Invalid voice preferences')
  const entries = Object.entries(candidate.peers)
  if (
    entries.length > 100 ||
    entries.some(
      ([id, peer]) =>
        !id ||
        id.length > 80 ||
        !peer ||
        typeof peer.muted !== 'boolean' ||
        !Number.isFinite(peer.volume) ||
        peer.volume < 0 ||
        peer.volume > 2
    )
  )
    throw new Error('Invalid voice preferences')
  return {
    enabled: candidate.enabled,
    openMic: candidate.openMic,
    peers: Object.fromEntries(
      entries.map(([id, peer]) => [id, { muted: peer.muted, volume: peer.volume }])
    )
  }
}
