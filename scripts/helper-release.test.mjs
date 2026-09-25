/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKeyPairSync, sign, createHash } from 'node:crypto'
import {
  verifyCosmeticModule,
  verifyHelperBinary,
  verifyHelperRelease
} from '../src/main/anticheat/helper-release-verifier.ts'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const bytes = Buffer.from('fixture-helper')
const cosmeticBytes = Buffer.from('fixture-cosmetic-module')
const manifest = {
  schemaVersion: 1,
  version: '0.1.0',
  platform: 'linux',
  arch: 'x64',
  fileName: 'game-inspector-linux-x64',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sizeBytes: bytes.length,
  cosmeticModule: {
    fileName: 'papamo-cosmetic-module-linux-x86.so',
    sha256: createHash('sha256').update(cosmeticBytes).digest('hex'),
    sizeBytes: cosmeticBytes.length
  }
}
const envelopeFor = (value) => {
  const manifest = JSON.stringify(value)
  return { manifest, signature: sign(null, Buffer.from(manifest), privateKey).toString('base64') }
}

test('accepts a signed manifest and matching binary', () => {
  const approved = verifyHelperRelease(envelopeFor(manifest), pem)
  verifyHelperBinary(bytes, approved)
  verifyCosmeticModule(cosmeticBytes, approved)
})

test('rejects altered bytes, altered metadata, another key, and unsigned manifests', () => {
  const envelope = envelopeFor(manifest)
  assert.throws(() => verifyHelperBinary(Buffer.from('modified-binary'), manifest))
  assert.throws(() => verifyCosmeticModule(Buffer.from('modified-module'), manifest))
  assert.throws(() =>
    verifyHelperRelease({ ...envelope, manifest: envelope.manifest.replace('0.1.0', '0.2.0') }, pem)
  )
  const anotherKey = generateKeyPairSync('ed25519')
    .publicKey.export({ type: 'spki', format: 'pem' })
    .toString()
  assert.throws(() => verifyHelperRelease(envelope, anotherKey))
  assert.throws(() => verifyHelperRelease({ manifest: envelope.manifest }, pem))
})

test('even signed manifests cannot introduce traversal, invalid platforms, oversized binaries or malformed hashes', () => {
  for (const changes of [
    { fileName: '../game-inspector' },
    { platform: 'other' },
    { sizeBytes: 0 },
    { sizeBytes: 33554433 },
    { sha256: 'not-a-hash' },
    { version: '../release' },
    { cosmeticModule: undefined },
    { cosmeticModule: { ...manifest.cosmeticModule, fileName: '../module.so' } },
    { platform: 'win', arch: 'arm64', fileName: 'game-inspector-win-arm64.exe' }
  ])
    assert.throws(() => verifyHelperRelease(envelopeFor({ ...manifest, ...changes }), pem))
})
