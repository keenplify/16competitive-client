/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HelperVerificationRetry,
  noteHelperServerUpdate
} from '../src/main/anticheat/helper-verification-retry.ts'

test('a previously verified launcher retries ordinary outages for one bounded minute', () => {
  const policy = new HelperVerificationRetry()
  assert.equal(policy.retryConnectionFailure(1_000), true)
  assert.equal(policy.retryConnectionFailure(60_999), true)
  assert.equal(policy.retryConnectionFailure(61_000), false)
  assert.equal(policy.retryConnectionFailure(80_000), false)
  policy.verified()
  assert.equal(policy.retryConnectionFailure(90_000), true)
})

test('a planned deployment receives two minutes without repeated notices extending an active retry', () => {
  noteHelperServerUpdate(200_000)
  const policy = new HelperVerificationRetry()
  assert.equal(policy.retryConnectionFailure(201_000), true)
  noteHelperServerUpdate(260_000)
  assert.equal(policy.retryConnectionFailure(320_999), true)
  assert.equal(policy.retryConnectionFailure(321_000), false)
  const afterUpdate = new HelperVerificationRetry()
  assert.equal(afterUpdate.retryConnectionFailure(400_000), true)
  assert.equal(afterUpdate.retryConnectionFailure(460_000), false)
})

import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

async function launcherGuard() {
  let now = 1_000_000
  let callback
  let failure = null
  let checks = 0
  let quits = 0
  const dialogs = []
  const reports = []
  class ConnectionError extends Error {}
  const context = vm.createContext({
    Date: class extends Date {
      static now() {
        return now
      }
    },
    REQUIRES_SIGNED_HELPER: true,
    HelperApprovalConnectionError: ConnectionError,
    assertHelperForBackend: async () => {
      checks++
      if (failure) throw failure
    },
    recordAntiCheatFailure: async (...value) => reports.push(value),
    console: { error: () => undefined, warn: () => undefined },
    dialog: { showErrorBox: (...value) => dialogs.push(value) },
    app: {
      once: () => undefined,
      quit() {
        quits++
      }
    },
    setInterval: (fn) => {
      callback = fn
      return { unref: () => undefined }
    },
    clearInterval: () => undefined
  })
  const transpile = (source) =>
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
    }).outputText
  const policy = new vm.SourceTextModule(
    transpile(
      await readFile(
        new URL('../src/main/anticheat/helper-verification-retry.ts', import.meta.url),
        'utf8'
      )
    ),
    { context }
  )
  await policy.link(() => {
    throw new Error('Unexpected policy import')
  })
  await policy.evaluate()
  context.HelperVerificationRetry = policy.namespace.HelperVerificationRetry
  const index = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const start = index.indexOf('  if (REQUIRES_SIGNED_HELPER) {', index.indexOf('app.whenReady()'))
  const end = index.indexOf('  const reportRetry', start)
  assert.ok(start > 0 && end > start)
  new vm.Script(transpile(index.slice(start, end))).runInContext(context)
  return {
    fail: (value) => {
      failure = value === 'offline' ? new ConnectionError() : value ? new Error(value) : null
    },
    restart: () => policy.namespace.noteHelperServerUpdate(),
    tick: async (ms) => {
      now += ms
      callback()
      await new Promise((resolve) => setImmediate(resolve))
    },
    checks: () => checks,
    quits: () => quits,
    dialogs,
    reports
  }
}

test('actual launcher guard silently recovers a planned update instead of reporting or quitting', async () => {
  const h = await launcherGuard()
  h.restart()
  h.fail('offline')
  await h.tick(60_000)
  await h.tick(60_000)
  assert.equal(h.quits(), 0)
  assert.equal(h.dialogs.length, 0)
  assert.equal(h.reports.length, 0)
  h.fail(null)
  await h.tick(2_000)
  const calls = h.checks()
  await h.tick(2_000)
  assert.equal(h.checks(), calls, 'normal verification cadence resumes after success')
})

test('actual launcher guard rejects tampering immediately even during an update', async () => {
  const h = await launcherGuard()
  h.restart()
  h.fail('binary hash mismatch')
  await h.tick(60_000)
  assert.equal(h.quits(), 1)
  assert.equal(h.dialogs.length, 1)
  assert.equal(h.reports.length, 1)
})

test('actual launcher guard ends the outage grace without resetting it on retry', async () => {
  const h = await launcherGuard()
  h.restart()
  h.fail('offline')
  await h.tick(60_000)
  await h.tick(119_999)
  assert.equal(h.quits(), 0)
  await h.tick(2_000)
  assert.equal(h.quits(), 1)
  assert.equal(h.reports.length, 1)
})
