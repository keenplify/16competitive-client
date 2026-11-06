import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { musicDeliveryReport, parseMusicDiagnostics } from '../src/main/game/music-diagnostics.ts'

test('music delivery diagnostics retain bounded counts without exposing arbitrary helper data', () => {
  const value = {
    version: 1,
    matchId: 'match',
    status: 'partial',
    completed: 2,
    total: 3,
    failed: 1,
    token: 'secret',
    path: 'private'
  }
  const text = parseMusicDiagnostics(value, 'match')
  assert.match(text, /verified 2\/3; failed 1/)
  assert.ok(!text.includes('secret') && !text.includes('private'))
  for (const data of [
    null,
    { ...value, matchId: 'other' },
    { ...value, failed: 2 },
    { ...value, completed: -1 },
    { ...value, total: 4097 },
    { ...value, status: 'secret' }
  ])
    assert.equal(parseMusicDiagnostics(data, 'match'), null)
})

test('reports include only recent, matching music delivery diagnostics and never invent zero on missing data', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-music-report-'))
  const path = join(directory, 'music-diagnostics.json')
  try {
    assert.match(await musicDeliveryReport(directory, 'match'), /Unavailable/)
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        matchId: 'match',
        status: 'ready',
        completed: 3,
        total: 3,
        failed: 0
      })
    )
    assert.match(await musicDeliveryReport(directory, 'match'), /verified 3\/3/)
    assert.match(await musicDeliveryReport(directory, 'other'), /Unavailable/)
    await writeFile(path, 'x'.repeat(2049))
    assert.match(await musicDeliveryReport(directory, 'match'), /Unavailable/)
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        matchId: 'match',
        status: 'ready',
        completed: 3,
        total: 3,
        failed: 0
      })
    )
    const old = new Date(Date.now() - 11 * 60_000)
    await utimes(path, old, old)
    assert.match(await musicDeliveryReport(directory, 'match'), /Unavailable/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
