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
  await assert.rejects(readFile(join(directory, 'session.ticket')), { code: 'ENOENT' })
  assert.equal(await readFile(join(directory, 'launcher.stopped'), 'utf8'), '1\n')
})

test('heartbeats cannot extend the two-hour ticket; a new game gets a new ticket', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), '16c-ticket-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let now = 1000000
  const first = new SessionLease(directory, () => now)
  await first.start()
  const ticket = await readFile(join(directory, 'session.ticket'), 'utf8')
  assert.deepEqual(ticket.trim().split('\n').slice(2), ['1000000', '8200000'])
  now += 7199999
  await first.refresh()
  assert.equal(await readFile(join(directory, 'session.ticket'), 'utf8'), ticket)
  now++
  await first.refresh()
  assert.equal(first.timer, null)
  await assert.rejects(readFile(join(directory, 'session.ticket')), { code: 'ENOENT' })
  await assert.rejects(readFile(join(directory, 'launcher.lease')), { code: 'ENOENT' })
  await first.start()
  assert.equal(first.timer, null)
  const next = new SessionLease(directory, () => now)
  await next.start()
  const renewed = await readFile(join(directory, 'session.ticket'), 'utf8')
  await first.stop()
  assert.equal(await readFile(join(directory, 'session.ticket'), 'utf8'), renewed)
  assert.notEqual(renewed.split('\n')[1], ticket.split('\n')[1])
  assert.deepEqual(renewed.trim().split('\n').slice(2), ['8200000', '15400000'])
  await assert.rejects(readFile(join(directory, 'launcher.stopped')), { code: 'ENOENT' })
  await next.stop()
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
