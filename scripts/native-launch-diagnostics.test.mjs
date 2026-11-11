import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
const root = await mkdtemp(join(tmpdir(), '16c-native-report-'))
after(() => rm(root, { recursive: true, force: true }))
const output = join(root, 'reader.mjs')
await build({
  entryPoints: ['src/main/game/native-launch-diagnostics.ts'],
  outfile: output,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent'
})
const { nativeLaunchReport } = await import(pathToFileURL(output))
const file = join(root, 'native-launch-failure.json')
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const match = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const now = Date.now()
const fixture = {
  version: 1,
  ownerHash: createHash('sha256').update(owner).digest('hex'),
  at: now,
  matchId: match,
  game: 'cs13',
  executable: 'hl.exe',
  helperVersion: 'a'.repeat(64),
  failure: {
    code: 'GAME_SPAWN_FAILED',
    osError: 740,
    errorKind: 'PermissionDenied',
    elevated: false,
    cleanupCodes: 'INSPECTOR_STOP_FAILED',
    originalCode: 'GAME_SPAWN_FAILED',
    token: 'secret-token',
    path: 'private-path'
  }
}
test('native browser failures are included only for the same account and recent match', async () => {
  await writeFile(file, JSON.stringify(fixture))
  const report = await nativeLaunchReport(root, owner, undefined, now)
  assert.ok(report.includes('"osError":740'))
  assert.ok(report.includes('"executable":"hl.exe"'))
  assert.ok(report.includes('INSPECTOR_STOP_FAILED'))
  for (const hidden of ['secret-token', 'private-path', owner]) assert.ok(!report.includes(hidden))
  for (const args of [
    [root, null, undefined, now],
    [root, 'another-account', undefined, now],
    [root, owner, owner, now],
    [root, owner, match, now + 6 * 60 * 60_000 + 1],
    [root, owner, match, now - 1]
  ])
    assert.ok((await nativeLaunchReport(...args)).includes('Unavailable'))
})
test('modified, oversized and linked diagnostic files cannot expose arbitrary local data', async () => {
  for (const value of [
    { ...fixture, game: 'private-path' },
    { ...fixture, executable: 'C:/secret/hl.exe' },
    { ...fixture, failure: { code: 'private-token' } },
    'x'.repeat(4097)
  ]) {
    await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value))
    assert.ok((await nativeLaunchReport(root, owner, undefined, now)).includes('Unavailable'))
  }
  if (process.platform !== 'win32') {
    await rm(file)
    const target = join(root, 'private')
    await writeFile(target, JSON.stringify(fixture))
    await symlink(target, file)
    assert.ok((await nativeLaunchReport(root, owner, undefined, now)).includes('Unavailable'))
  }
})
