import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { localSigningCredentials } from './publish.mjs'

test('local signing rejects an unpinned key, exposed credential files and symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-signing-'))
  try {
    const keys = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
    const keyPath = join(root, 'private.pem')
    const configPath = join(root, 'credentials.json')
    await writeFile(keyPath, keys.privateKey, { mode: 0o600 })
    await writeFile(
      configPath,
      JSON.stringify({
        privateKeyPath: keyPath,
        registryUrl: 'https://example.com',
        publisherToken: 'x'.repeat(32)
      }),
      { mode: 0o600 }
    )
    await localSigningCredentials(keys.publicKey, configPath)
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' })
    await assert.rejects(localSigningCredentials(other, configPath), /does not match/)
    await chmod(keyPath, 0o644)
    await assert.rejects(localSigningCredentials(keys.publicKey, configPath), /owner-only/)
    await chmod(keyPath, 0o600)
    await chmod(configPath, 0o644)
    await assert.rejects(localSigningCredentials(keys.publicKey, configPath), /insecure/)
    await chmod(configPath, 0o600)
    const link = join(root, 'linked.json')
    await symlink(configPath, link)
    await assert.rejects(localSigningCredentials(keys.publicKey, link), /insecure/)
    await writeFile(configPath, '{"publisherToken":"SECRET_MARKER" broken')
    await assert.rejects(
      localSigningCredentials(keys.publicKey, configPath),
      (error) => !error.message.includes('SECRET_MARKER')
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
