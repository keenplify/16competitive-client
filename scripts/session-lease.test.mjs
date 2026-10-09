import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'

const compiled = await build({
  entryPoints: ['src/main/game/session-lease.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false
})
const { SessionLease } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
)

test('stop drains pending lease writes and leaves a shutdown marker', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), '16c-lease-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const lease = new SessionLease(directory)
  await lease.start()
  assert.match(await readFile(join(directory, 'launcher.lease'), 'utf8'), /^[a-f0-9-]{36}\n$/)
  await lease.stop()
  await lease.stop()
  await assert.rejects(readFile(join(directory, 'launcher.lease')), { code: 'ENOENT' })
  assert.equal(await readFile(join(directory, 'launcher.stopped'), 'utf8'), '1\n')
})

test('stop racing startup cannot install a new heartbeat timer', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), '16c-lease-race-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const lease = new SessionLease(directory)
  await Promise.all([lease.start(), lease.stop()])
  assert.equal(lease.timer, null)
  await assert.rejects(readFile(join(directory, 'launcher.lease')), { code: 'ENOENT' })
  await lease.start()
  assert.equal(lease.timer, null)
})
