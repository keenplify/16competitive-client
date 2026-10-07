/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FailureReportQueue,
  parseFailureReports
} from '../src/main/anticheat/failure-report-queue.ts'
const make = (key = 'a', owner = 'player') => ({
  key: 'anticheat:' + key.repeat(64),
  at: Date.now(),
  owner,
  description: 'Automatic anti-cheat failure',
  details: '{}',
  matchId: '12345678-1234-4123-8123-123456789abc'
})
function harness() {
  let disk = []
  const storage = {
    read: async () => structuredClone(disk),
    write: async (rows) => {
      disk = structuredClone(rows)
    }
  }
  return {
    queue: new FailureReportQueue(storage),
    restart: () => new FailureReportQueue(storage),
    rows: () => disk
  }
}

test('queues offline, deduplicates concurrent failures and retries after restart', async () => {
  const h = harness()
  const incident = make()
  await Promise.all([h.queue.enqueue(incident), h.queue.enqueue(incident)])
  assert.equal(h.rows().length, 1)
  await assert.rejects(
    h.queue.flush(
      () => 'player',
      async () => {
        throw Error('offline')
      }
    )
  )
  assert(!h.rows()[0].submitted)
  const sent = []
  const restarted = h.restart()
  await restarted.flush(
    () => 'player',
    async (row) => sent.push(row)
  )
  await restarted.flush(
    () => 'player',
    async (row) => sent.push(row)
  )
  assert.equal(sent.length, 1)
  assert.equal(sent[0].key, incident.key)
})

test('prelogin incidents wait for sign-in and account-specific reports never cross accounts', async () => {
  const h = harness()
  await h.queue.enqueue(make('a', null))
  await h.queue.enqueue(make('b', 'other'))
  const sent = []
  await h.queue.flush(
    () => null,
    async (row) => sent.push(row)
  )
  assert.equal(sent.length, 0)
  await h.queue.flush(
    () => 'player',
    async (row) => sent.push(row)
  )
  assert.equal(sent.length, 1)
  assert.equal(h.rows()[0].owner, 'player')
  assert(!h.rows()[1].submitted)
})

test('failed prelogin upload remains bound to the first account', async () => {
  const h = harness()
  await h.queue.enqueue(make('a', null))
  await assert.rejects(
    h.queue.flush(
      () => 'player',
      async () => {
        throw Error('offline')
      }
    )
  )
  await h.queue.flush(
    () => 'other',
    async () => assert.fail('cross-account report')
  )
  assert.equal(h.rows()[0].owner, 'player')
})

test('bounds and expires saved reports', () => {
  const now = Date.now()
  const old = { ...make(), at: now - 8 * 86400000 }
  const invalid = { ...make(), details: 'x'.repeat(4001) }
  const recent = { ...make(), at: now - 1 }
  assert.equal(parseFailureReports(JSON.stringify([old, invalid, recent]), now).length, 1)
  assert.equal(parseFailureReports(JSON.stringify(Array(40).fill(recent)), now).length, 32)
})
