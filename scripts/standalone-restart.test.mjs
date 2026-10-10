import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStandaloneRestartHandoff } from '../src/main/game/standalone-restart.ts'

test('duplicate Windows notifications release, acknowledge and stop only once', async () => {
  const events = []
  let release
  const barrier = new Promise((resolve) => {
    release = resolve
  })
  const request = createStandaloneRestartHandoff(async () => {
    events.push('release-supervision')
    await barrier
    events.push('acknowledge', 'stop-session')
  })
  const first = request()
  assert.equal(request(), first)
  assert.equal(request(), first)
  await Promise.resolve()
  assert.deepEqual(events, ['release-supervision'])
  release()
  await first
  await request()
  assert.deepEqual(events, ['release-supervision', 'acknowledge', 'stop-session'])
})

test('a failed partial handoff is not replayed against the next session', async () => {
  let releases = 0
  const request = createStandaloneRestartHandoff(async () => {
    releases++
    throw new Error('restoration failed')
  })
  await assert.rejects(request(), /restoration failed/)
  await assert.rejects(request(), /restoration failed/)
  assert.equal(releases, 1)
})
