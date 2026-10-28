/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NativeReadinessRequests } from '../src/web/native-readiness-requests.ts'

test('many runtime readiness requests share one check until it completes', async () => {
  const requests = new NativeReadinessRequests()
  let finish
  let calls = 0
  const check = () => {
    calls++
    return new Promise((resolve) => {
      finish = resolve
    })
  }
  const pending = Array.from({ length: 50 }, () => requests.run('account', check))
  await Promise.resolve()
  assert.equal(calls, 1)
  finish({ competitiveReady: false, device: { banned: false } })
  const values = await Promise.all(pending)
  assert.ok(values.every((value) => value === values[0]))
})

test('429 and other failures cool down before another runtime check can start', async () => {
  let now = 0
  let calls = 0
  const requests = new NativeReadinessRequests(() => now)
  const check = async () => {
    calls++
    throw new Error('429')
  }
  for (let i = 0; i < 50; i++) await assert.rejects(requests.run('account', check), /429/)
  assert.equal(calls, 1)
  now = 10_001
  await assert.rejects(requests.run('account', check), /429/)
  assert.equal(calls, 2)
})

test('account changes cannot overlap native workers or reuse another account result', async () => {
  const requests = new NativeReadinessRequests()
  let finish
  const first = requests.run(
    'a',
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let calls = 0
  const second = requests.run('b', async () => {
    calls++
    return { competitiveReady: true }
  })
  await Promise.resolve()
  assert.equal(calls, 0)
  finish({ competitiveReady: false })
  await first
  assert.equal((await second).competitiveReady, true)
  assert.equal(calls, 1)
})
