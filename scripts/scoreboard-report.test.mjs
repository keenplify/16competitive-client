import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createScoreboardReporter } from '../src/main/game/scoreboard-report.ts'

const incident = {
  matchId: 'match-a',
  client: 'NextClient',
  platform: 'win32',
  architecture: 'x64',
  reason: 'scoreboard frame stalled',
  health: { feedReady: true, rendererCrashed: false, frameAgeMs: 9000, markersPresent: true },
  recovery: 'request completed'
}

test('reports client and health once per problem per match, including concurrent calls', async () => {
  const calls = []
  const report = createScoreboardReporter(async (...args) => calls.push(args))
  await Promise.all([report(incident), report(incident)])
  assert.equal(calls.length, 1)
  assert.match(calls[0][0], /Game client: NextClient/)
  assert.match(calls[0][0], /visibility is not verified/)
  assert.deepEqual(JSON.parse(calls[0][1][0]).scoreboardIncident, incident)
  assert.equal(calls[0][2], 'scoreboard:match-a:scoreboard frame stalled')
  await report({
    ...incident,
    reason: 'renderer crashed',
    recovery: 'failed',
    error: 'renderer exited'
  })
  await report({ ...incident, matchId: 'match-b' })
  assert.equal(calls.length, 3)
})

test('retries transient report failures with the same server deduplication key', async () => {
  const keys = [],
    delays = []
  const report = createScoreboardReporter(
    async (_description, _logs, key) => {
      keys.push(key)
      if (keys.length < 3) throw new Error('offline')
    },
    async (ms) => delays.push(ms)
  )
  await report(incident)
  assert.deepEqual(delays, [1000, 2000])
  assert.equal(new Set(keys).size, 1)
  await report(incident)
  assert.equal(keys.length, 3)
})

test('caps failed submissions without blocking watchdog repairs or flooding the API', async () => {
  let attempts = 0
  const report = createScoreboardReporter(
    async () => {
      attempts++
      throw new Error('offline')
    },
    async () => {}
  )
  await report(incident)
  await report(incident)
  assert.equal(attempts, 3)
})
