/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEarlyAssetSync } from '../src/shared/early-asset-sync.ts'

test('a known folder starts sync immediately once authenticated, without a queue or match', async () => {
  const schedule = createEarlyAssetSync()
  let calls = 0
  const sync = async () => {
    calls++
  }
  await schedule(null, 'session', sync)
  await schedule('/game', null, sync)
  assert.equal(calls, 0)
  await schedule('/game', 'session', sync)
  await schedule('/game', 'session', sync)
  assert.equal(calls, 1)
  await schedule('/game', 'another-session', sync)
  assert.equal(calls, 2)
})

test('changing folders waits for ongoing preparation before starting the new installation', async () => {
  const schedule = createEarlyAssetSync()
  let release
  const order = []
  const first = schedule(
    '/one',
    'session',
    () =>
      new Promise((resolve) => {
        order.push('one')
        release = resolve
      })
  )
  await Promise.resolve()
  await Promise.resolve()
  const second = schedule('/two', 'session', async () => {
    order.push('two')
  })
  await Promise.resolve()
  assert.deepEqual(order, ['one'])
  release()
  await Promise.all([first, second])
  assert.deepEqual(order, ['one', 'two'])
})
