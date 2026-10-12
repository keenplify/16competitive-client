import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { expectedAssets, createArtifactManifest, verifyArtifactManifest } from './artifacts.mjs'
import { releaseEnvironment } from './environment.mjs'

test('artifact approval rejects changed binaries, wrong revisions, traversal names and symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-local-artifacts-'))
  const commit = 'a'.repeat(40)
  const names = expectedAssets('helper', '0.1.1')
  try {
    for (const name of names) await writeFile(join(root, name), `binary ${name}`)
    await createArtifactManifest(root, 'helper', '0.1.1', commit)
    await verifyArtifactManifest(root, 'helper', '0.1.1', commit)
    await assert.rejects(verifyArtifactManifest(root, 'helper', '0.1.1', 'b'.repeat(40)))
    await writeFile(join(root, names[0]), 'modified')
    await assert.rejects(verifyArtifactManifest(root, 'helper', '0.1.1', commit))
    await writeFile(join(root, names[0]), `binary ${names[0]}`)
    const manifest = JSON.parse(await readFile(join(root, 'local-build.json'), 'utf8'))
    manifest.files['../escape'] = manifest.files[names[0]]
    await writeFile(join(root, 'local-build.json'), JSON.stringify(manifest))
    await assert.rejects(verifyArtifactManifest(root, 'helper', '0.1.1', commit))
    await createArtifactManifest(root, 'helper', '0.1.1', commit)
    await rm(join(root, names[0]))
    await symlink(join(root, names[1]), join(root, names[0]))
    await assert.rejects(verifyArtifactManifest(root, 'helper', '0.1.1', commit))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('release env forwards public settings only, honors overrides and rejects development endpoints', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-local-env-'))
  try {
    await writeFile(
      join(root, '.env'),
      'API_BASE_URL=http://127.0.0.1:3000\nDISCORD_CLIENT_ID=123456789012345678\nHELPER_SIGNING_PRIVATE_KEY=secret\nDATABASE_URL=secret\nDISCORD_IPC_PATH=/local/socket\n'
    )
    await assert.rejects(releaseEnvironment(root, {}), /production/)
    await writeFile(
      join(root, '.env.release.local'),
      'API_BASE_URL=https://16competitive.papamo.dev\nDISCORD_LARGE_IMAGE_KEY=logo\n'
    )
    const settings = await releaseEnvironment(root, { DISCORD_LARGE_IMAGE_KEY: 'custom' })
    assert.deepEqual(
      Object.keys(settings).sort(),
      ['API_BASE_URL', 'MATCHMAKING_WS_URL', 'DISCORD_CLIENT_ID', 'DISCORD_LARGE_IMAGE_KEY'].sort()
    )
    assert.equal(settings.DISCORD_LARGE_IMAGE_KEY, 'custom')
    assert.equal(settings.DISCORD_CLIENT_ID, '123456789012345678')
    for (const url of [
      'https://localhost',
      'https://127.0.0.1',
      'https://user:password@example.com'
    ])
      await assert.rejects(releaseEnvironment(root, { API_BASE_URL: url }))
    await assert.rejects(releaseEnvironment(root, { DISCORD_CLIENT_ID: 'invalid' }))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
