/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/main/game/cs16-launcher.ts', import.meta.url), 'utf8')
const start = source.indexOf('export const launchOrdinaryCounterStrike =')
const end = source.indexOf('\nconst finishAntiCheatSession', start)
const code = ts.transpile(source.slice(start, end).replace('export ', ''), {
  target: ts.ScriptTarget.ES2022
})
const launcher = (queue, cleanup) =>
  new Function('launchQueue', 'shutdownManagedGame', `${code}; return launchOrdinaryCounterStrike`)(
    queue,
    cleanup
  )

test('ordinary launches wait for managed launch and restoration, then run serially', async () => {
  const events = []
  let finishManaged, finishCleanup
  const managed = new Promise((resolve) => {
    finishManaged = resolve
  })
  const cleanup = new Promise((resolve) => {
    finishCleanup = resolve
  })
  const launch = launcher(managed, async () => {
    events.push('cleanup')
    await cleanup
  })
  const first = launch(async () => {
    events.push('first')
  })
  const second = launch(async () => {
    events.push('second')
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, [])
  finishManaged()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, ['cleanup'])
  finishCleanup()
  await Promise.all([first, second])
  assert.deepEqual(events, ['cleanup', 'first', 'cleanup', 'second'])
})

test('failed managed restoration prevents an ordinary replacement launch', async () => {
  let launched = false
  const launch = launcher(Promise.resolve(), async () => {
    throw new Error('restoration failed')
  })
  await assert.rejects(
    launch(async () => {
      launched = true
    }),
    /restoration failed/
  )
  assert.equal(launched, false)
})
