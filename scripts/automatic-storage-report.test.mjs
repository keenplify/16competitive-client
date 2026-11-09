/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAutomaticStorageReporter } from '../src/main/automatic-storage-report.ts'

const failure = (code = 'EACCES') =>
  new Error('match.assets.storageDenied', {
    cause: Object.assign(new Error('private path must not enter description'), {
      code,
      syscall: 'mkdir',
      path: 'C:\\Users\\PrivateUser\\Games\\cstrk13\\client.dll'
    })
  })
const event = (error = failure()) => ({ matchId: 'match', error, apiUrl: 'https://region.example' })

test('reports storage failures once per account/match and retains diagnostic code and region', async () => {
  const calls = []
  let account = 'one'
  const report = createAutomaticStorageReporter(
    async (...args) => calls.push(args),
    () => account
  )
  await report(event(new Error('User cancelled')))
  assert.equal(calls.length, 0)
  await Promise.all([report(event()), report(event()), report(event(failure('EPERM')))])
  assert.equal(calls.length, 1)
  assert.match(calls[0][0], /EACCES/)
  assert.match(calls[0][0], /Operation: mkdir/)
  assert.match(calls[0][0], /Target name: client.dll/)
  assert.doesNotMatch(calls[0][0], /PrivateUser/)
  assert.doesNotMatch(calls[0][0], /private path/)
  assert.deepEqual(calls[0].slice(1), [
    [],
    'match-storage-denied:match',
    'match',
    'https://region.example'
  ])
  account = 'two'
  await report(event())
  assert.equal(calls.length, 2)
  account = null
  await report({ ...event(), matchId: 'another' })
  assert.equal(calls.length, 2)
})

test('raw filesystem denial retries, while exhausted uploads can be attempted later', async () => {
  let calls = 0
  const report = createAutomaticStorageReporter(
    async () => {
      calls++
      throw new Error('offline')
    },
    () => 'account',
    async () => {}
  )
  const raw = Object.assign(new Error('denied'), { code: 'EROFS', syscall: 'symlink' })
  await report(event(raw))
  assert.equal(calls, 3)
  await report(event(raw))
  assert.equal(calls, 6)
})

test('account changes stop retries of another account’s failure', async () => {
  let owner = 'one',
    calls = 0
  const report = createAutomaticStorageReporter(
    async () => {
      calls++
      throw new Error('offline')
    },
    () => owner,
    async () => {
      owner = 'two'
    }
  )
  await report(event())
  assert.equal(calls, 1)
})
