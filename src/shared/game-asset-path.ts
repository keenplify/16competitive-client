// Match assets remain confined to versioned, launcher-owned game directories.
export const BUNDLED_PING_ASSET_PATHS = [
  'models/16competitive/ping/v2/ef_gundrop.mdl',
  'models/16competitive/ping/v2/ef_gundrop_red.mdl',
  'sound/16competitive/ping/v1/ping.wav',
  'sound/16competitive/ping/v1/item.wav',
  'sound/16competitive/ping/v1/enemy.wav'
] as const

export const isBundledPingAssetPath = (path: string): boolean =>
  (BUNDLED_PING_ASSET_PATHS as readonly string[]).includes(path)

const versionedPaths = [
  /^models\/16competitive\/[a-z0-9_]+\/([a-f0-9]{16,64})\/(?:view|player|world|v|p|w)\.mdl$/,
  /^sound\/16competitive\/[a-z0-9_]+\/([a-f0-9]{16,64})\/action\.wav$/,
  /^sprites\/16competitive\/[a-z0-9_]+\/([a-f0-9]{16,64})\/(?:explosion|e)\.spr$/,
  /^sprites\/16competitive\/system\/([a-f0-9]{16,64})\/gas\.spr$/
]

export const versionedGameAssetHash = (path: string): string | null => {
  for (const pattern of versionedPaths) {
    const match = pattern.exec(path)
    if (match) return match[1]
  }
  return null
}
