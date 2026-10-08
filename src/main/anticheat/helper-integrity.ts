import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import releaseConfig from '../../../helper-release.json'
import { verifyHelperBinary, verifyHelperRelease } from './helper-release-verifier'

import { resolveServiceApiUrl } from '../matchmaking-regions'

const approvals = new Map<string, number>()

export class HelperApprovalConnectionError extends Error {
  constructor(
    cause: unknown,
    readonly apiOrigin: string
  ) {
    super('Could not connect to the helper approval service', { cause })
    this.name = 'HelperApprovalConnectionError'
  }
}

/** Local integrity check only: neither the helper nor this launcher is remote attestation. */
export async function verifyPackagedHelper(binary: string, apiUrl?: string): Promise<void> {
  const envelope: unknown = JSON.parse(
    await readFile(join(dirname(binary), 'manifest.json'), 'utf8')
  )
  const manifest = verifyHelperRelease(envelope, releaseConfig.publicKeyPem)
  if (
    manifest.version !== releaseConfig.version ||
    manifest.platform !== (process.platform === 'win32' ? 'win' : process.platform) ||
    manifest.arch !== process.arch
  )
    throw new Error('Helper release does not match this launcher')
  verifyHelperBinary(await readFile(binary), manifest)
  const origin = new URL(apiUrl ?? (await resolveServiceApiUrl()))
  if (origin.protocol !== 'https:' || origin.username || origin.password)
    throw new Error('Invalid helper registry')
  const key = `${origin.origin}/${manifest.version}/${manifest.platform}/${manifest.arch}`
  if (Date.now() >= (approvals.get(key) ?? 0)) {
    const response = await fetch(
      new URL(`/helper-releases/${manifest.version}/${manifest.platform}/${manifest.arch}`, origin),
      { signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store' }
    ).catch((error: unknown) => {
      throw new HelperApprovalConnectionError(error, origin.origin)
    })
    if ([502, 503, 504].includes(response.status)) {
      throw new HelperApprovalConnectionError(
        new Error(`Helper approval service temporarily unavailable (HTTP ${response.status})`),
        origin.origin
      )
    }
    if (!response.ok)
      throw new Error(
        `Helper release is not currently approved (${origin.origin}, HTTP ${response.status})`
      )
    const approved: unknown = await response.json()
    const approvedManifest = verifyHelperRelease(approved, releaseConfig.publicKeyPem)
    if (JSON.stringify(approvedManifest) !== JSON.stringify(manifest))
      throw new Error('Helper release differs from backend approval')
    approvals.set(key, Date.now() + 60_000)
  }
}
