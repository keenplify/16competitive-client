/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), '16c-voice-owner-'))
after(() => rm(directory, { recursive: true, force: true }))
const output = join(directory, 'store.mjs')
await build({
  entryPoints: ['src/renderer/src/features/voice/native-voice.store.ts'],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent'
})
globalThis.window = {
  api: { gameSettings: { nativeSessionStatus: (id) => globalThis.readVoiceStatus(id) } }
}
const { useNativeVoiceStore: store } = await import(pathToFileURL(output))
const settle = () => new Promise((resolve) => setImmediate(resolve))
after(() => {
  delete globalThis.window
  delete globalThis.readVoiceStatus
})

test('ownership ignores old match replies and stale observers cannot reset a new match', async () => {
  const pending = new Map()
  globalThis.readVoiceStatus = (id) => new Promise((resolve) => pending.set(id, resolve))
  const stopA = store.getState().observe('match-a')
  await settle()
  const stopB = store.getState().observe('match-b')
  await settle()
  pending.get('match-a')({ owned: true, connected: true })
  await settle()
  assert.equal(store.getState().matchId, 'match-b')
  assert.equal(store.getState().owned, false)
  pending.get('match-b')({ owned: true, connected: false })
  await settle()
  stopA()
  assert.equal(store.getState().owned, true)
  assert.equal(store.getState().connected, false)
  stopB()
  assert.equal(store.getState().owned, false)
  assert.equal(store.getState().matchId, null)
})

test('helper failure releases browser audio ownership on the next status poll', async () => {
  let calls = 0
  globalThis.readVoiceStatus = async () => {
    if (++calls === 1) return { owned: true, connected: true }
    throw new Error('helper stopped')
  }
  const stop = store.getState().observe('match-a')
  try {
    await settle()
    assert.equal(store.getState().owned, true)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    assert.equal(store.getState().owned, false)
    assert.equal(store.getState().connected, false)
  } finally {
    stop()
  }
})
