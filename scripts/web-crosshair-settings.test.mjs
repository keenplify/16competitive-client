/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as crosshair from '../src/shared/crosshair.ts'

const source = ts.transpileModule(
  readFileSync(new URL('../src/web/crosshair-settings.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText
const exports = {}
new Function('require', 'exports', source)((name) => {
  assert.equal(name, '../shared/crosshair')
  return crosshair
}, exports)
const { saveBrowserCrosshair } = exports
const { DEFAULT_CROSSHAIR } = crosshair

const browserSettings = () => ({ platform: 'other', crosshair: DEFAULT_CROSSHAIR })

test('web crosshair saves to the account when the helper is unavailable', async () => {
  const calls = []
  const saved = await saveBrowserCrosshair(
    DEFAULT_CROSSHAIR,
    async (config) => {
      calls.push(['account', config])
    },
    async (config) => {
      calls.push(['helper', config])
      throw new Error('Helper offline')
    },
    browserSettings
  )
  assert.deepEqual(
    calls.map(([target]) => target),
    ['account', 'helper']
  )
  assert.match(calls[0][1], /^cs2 /)
  assert.equal(saved.crosshair.shareCode, DEFAULT_CROSSHAIR.shareCode)
  assert.equal(saved.platform, 'other')
})

test('web crosshair does not claim a save when the account rejects it', async () => {
  let helperCalled = false
  await assert.rejects(
    saveBrowserCrosshair(
      DEFAULT_CROSSHAIR,
      async () => {
        throw new Error('Account unavailable')
      },
      async () => {
        helperCalled = true
        return browserSettings()
      },
      browserSettings
    ),
    /Account unavailable/
  )
  assert.equal(helperCalled, false)
})
