import { createHash, createPublicKey, verify } from 'node:crypto'

export const rendererUpdateContext = '16competitive-renderer-update-v1\n'
export const maxRendererUpdateBytes = 128 * 1024 * 1024
const versionPattern = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/

export interface RendererUpdateManifest {
  format: 1
  version: string
  platform: 'win32'
  arch: 'x64' | 'arm64'
  compatibility: string
  file: string
  sha256: string
  size: number
}
export interface SignedRendererUpdate {
  manifest: string
  signature: string
}
export interface RendererUpdateState {
  active?: SignedRendererUpdate
  previous?: SignedRendererUpdate
  pending?: SignedRendererUpdate
  launching?: string
  failedVersion?: string
}

export function newerVersion(candidate: string, current: string): boolean {
  if (!versionPattern.test(candidate) || !versionPattern.test(current)) return false
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  return (a.map((part, index) => part - b[index]).find((part) => part !== 0) ?? 0) > 0
}

export function parseRendererManifest(value: unknown): RendererUpdateManifest {
  if (!value || typeof value !== 'object') throw new Error('Invalid renderer update manifest.')
  const m = value as RendererUpdateManifest
  if (
    m.format !== 1 ||
    typeof m.version !== 'string' ||
    !versionPattern.test(m.version) ||
    m.platform !== 'win32' ||
    !['x64', 'arm64'].includes(m.arch) ||
    ![m.compatibility, m.sha256].every(
      (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
    ) ||
    m.file !== `16competitive-client-${m.version}-renderer-win-${m.arch}.asar` ||
    !Number.isSafeInteger(m.size) ||
    m.size < 1 ||
    m.size > maxRendererUpdateBytes
  )
    throw new Error('Invalid renderer update manifest.')
  return m
}

export function verifyRendererEnvelope(
  value: unknown,
  publicKeyPem: string
): RendererUpdateManifest {
  if (!value || typeof value !== 'object') throw new Error('Invalid renderer update signature.')
  const envelope = value as SignedRendererUpdate
  const key = createPublicKey(publicKeyPem)
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    typeof envelope.manifest !== 'string' ||
    envelope.manifest.length > 8192 ||
    typeof envelope.signature !== 'string' ||
    !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature) ||
    !verify(
      null,
      Buffer.from(rendererUpdateContext + envelope.manifest),
      key,
      Buffer.from(envelope.signature, 'base64')
    )
  )
    throw new Error('Invalid renderer update signature.')
  return parseRendererManifest(JSON.parse(envelope.manifest))
}

export function verifyRendererBytes(bytes: Uint8Array, manifest: RendererUpdateManifest): void {
  if (
    bytes.byteLength !== manifest.size ||
    createHash('sha256').update(bytes).digest('hex') !== manifest.sha256
  )
    throw new Error('Renderer update hash or size mismatch.')
}

export function recoverRendererState(state: RendererUpdateState): RendererUpdateState {
  if (!state.launching) return state
  return { active: state.previous, failedVersion: state.launching }
}
