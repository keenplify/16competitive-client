import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAutomaticMatchReporter } from '../src/main/automatic-match-report.ts'

test('reports only the affected player on an authoritative connection timeout', async () => {
  const calls = []
  const report = createAutomaticMatchReporter(async (...args) => calls.push(args))
  await report({ matchId: 'one', reason: 'PLAYER_DID_NOT_CONNECT', connectionFailed: false })
  await report({ matchId: 'one', reason: 'PLAYER_DECLINED', connectionFailed: true })
  await report({ matchId: 'one', reason: 'PLAYER_DID_NOT_CONNECT' })
  assert.equal(calls.length, 0)
  const event = { matchId: 'one', reason: 'PLAYER_DID_NOT_CONNECT', connectionFailed: true }
  await Promise.all([report(event), report(event)])
  assert.equal(calls.length, 1)
  assert.ok(calls[0][0].includes('Match ID: one'))
  assert.equal(calls[0][2], 'match-connect-timeout:one')
})

test('transient upload failures retry with the same deduplication key', async () => {
  const keys = []
  const report = createAutomaticMatchReporter(
    async (_description, _logs, key) => {
      keys.push(key)
      if (keys.length < 3) throw new Error('Temporary network error')
    },
    async () => undefined
  )
  await report({ matchId: 'retry', reason: 'PLAYER_DID_NOT_CONNECT', connectionFailed: true })
  assert.equal(keys.length, 3)
  assert.equal(new Set(keys).size, 1)
})
