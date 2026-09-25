import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import releaseConfig from '../../../helper-release.json'
import { verifyHelperBinary, verifyHelperRelease } from './helper-release-verifier'

let approvedUntil = 0

/** Local integrity check only: neither the helper nor this launcher is remote attestation. */
export async function verifyPackagedHelper(binary: string): Promise<void> {
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
  if (Date.now() >= approvedUntil) {
    const origin = new URL(releaseConfig.registryUrl)
    if (origin.protocol !== 'https:' || origin.username || origin.password)
      throw new Error('Invalid helper registry')
    const response = await fetch(
      new URL(`/helper-releases/${manifest.version}/${manifest.platform}/${manifest.arch}`, origin),
      { signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store' }
    )
    if (!response.ok) throw new Error('Helper release is not currently approved')
    const approved: unknown = await response.json()
    const approvedManifest = verifyHelperRelease(approved, releaseConfig.publicKeyPem)
    if (JSON.stringify(approvedManifest) !== JSON.stringify(manifest))
      throw new Error('Helper release differs from backend approval')
    approvedUntil = Date.now() + 60_000
  }
}
