import { createHash, createPublicKey, verify } from 'node:crypto'

export interface HelperManifest {
  schemaVersion: 1
  version: string
  platform: 'win' | 'linux'
  arch: 'x64' | 'arm64'
  fileName: string
  sha256: string
  sizeBytes: number
  cosmeticModule?: CosmeticModuleManifest
}

export interface CosmeticModuleManifest {
  fileName: 'papamo-cosmetic-module-linux-x86.so'
  sha256: string
  sizeBytes: number
}

export interface SignedHelperRelease {
  manifest: string
  signature: string
}

/** Sign the exact UTF-8 manifest string, never a reserialized object. */
export function verifyHelperRelease(value: unknown, publicKeyPem: string): HelperManifest {
  if (!value || typeof value !== 'object') throw new Error('Missing signed helper manifest')
  const envelope = value as Partial<SignedHelperRelease>
  if (
    typeof envelope.manifest !== 'string' ||
    envelope.manifest.length > 4096 ||
    typeof envelope.signature !== 'string' ||
    !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)
  )
    throw new Error('Invalid helper manifest envelope')
  const key = createPublicKey(publicKeyPem)
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    !verify(
      null,
      Buffer.from(envelope.manifest, 'utf8'),
      key,
      Buffer.from(envelope.signature, 'base64')
    )
  )
    throw new Error('Helper manifest signature verification failed')
  const manifest = JSON.parse(envelope.manifest) as Partial<HelperManifest> | null
  const cosmetic = manifest?.cosmeticModule
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.version !== 'string' ||
    !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(manifest.version) ||
    !['win', 'linux'].includes(manifest.platform ?? '') ||
    !['x64', 'arm64'].includes(manifest.arch ?? '') ||
    (manifest.platform === 'win' && manifest.arch !== 'x64') ||
    manifest.fileName !==
      `game-inspector-${manifest.platform}-${manifest.arch}${manifest.platform === 'win' ? '.exe' : ''}` ||
    typeof manifest.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    typeof manifest.sizeBytes !== 'number' ||
    !Number.isSafeInteger(manifest.sizeBytes) ||
    manifest.sizeBytes < 1 ||
    manifest.sizeBytes > 32 * 1024 * 1024 ||
    (manifest.platform === 'linux' &&
      (!cosmetic ||
        cosmetic.fileName !== 'papamo-cosmetic-module-linux-x86.so' ||
        !/^[a-f0-9]{64}$/.test(cosmetic.sha256) ||
        !Number.isSafeInteger(cosmetic.sizeBytes) ||
        cosmetic.sizeBytes < 1 ||
        cosmetic.sizeBytes > 32 * 1024 * 1024)) ||
    (manifest.platform === 'win' && cosmetic !== undefined)
  )
    throw new Error('Invalid helper manifest fields')
  return manifest as HelperManifest
}

export function verifyHelperBinary(bytes: Uint8Array, manifest: HelperManifest): void {
  if (
    bytes.byteLength !== manifest.sizeBytes ||
    createHash('sha256').update(bytes).digest('hex') !== manifest.sha256
  )
    throw new Error('Helper binary hash or size does not match its signed manifest')
}

export function verifyCosmeticModule(bytes: Uint8Array, manifest: HelperManifest): void {
  const cosmetic = manifest.cosmeticModule
  if (
    manifest.platform !== 'linux' ||
    !cosmetic ||
    bytes.byteLength !== cosmetic.sizeBytes ||
    createHash('sha256').update(bytes).digest('hex') !== cosmetic.sha256
  )
    throw new Error('Cosmetic module hash or size does not match its signed manifest')
}
