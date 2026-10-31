/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFirstPersonPreviewStore } from '../src/renderer/src/features/skins/first-person-preview.store.ts'

function ready(kind) {
  const store = createFirstPersonPreviewStore(kind)
  store.getState().finish()
  return store
}
test('quick grenade clicks finish the entire charge before throwing', () => {
  const store = ready('grenade')
  store.getState().press()
  assert.equal(store.getState().action, 'charge')
  store.getState().release()
  assert.equal(store.getState().action, 'charge')
  store.getState().finish()
  assert.equal(store.getState().action, 'throw')
})
test('holding a grenade keeps the final preparation pose until release', () => {
  const store = ready('grenade')
  store.getState().press()
  const start = store.getState().restart
  store.getState().finish()
  assert.equal(store.getState().action, 'hold')
  assert.equal(store.getState().restart, start)
  store.getState().fire()
  assert.equal(store.getState().action, 'hold')
  store.getState().release()
  assert.equal(store.getState().action, 'throw')
  assert.equal(store.getState().restart, start + 1)
})
test('throw advances through the fuse, explosion and a fresh draw; extra clicks cannot interrupt it', () => {
  const store = ready('grenade')
  store.getState().press()
  store.getState().release()
  store.getState().finish()
  store.getState().finish()
  assert.equal(store.getState().action, 'flight')
  store.getState().press()
  assert.equal(store.getState().action, 'flight')
  store.getState().finish()
  assert.equal(store.getState().action, 'explosion')
  assert.equal(store.getState().burst, 1)
  store.getState().finish()
  assert.equal(store.getState().action, 'draw')
  store.getState().finish()
  assert.equal(store.getState().action, 'idle')
})
test('blur or cancelled capture resets a prepared grenade without throwing or playing effects', () => {
  const store = ready('grenade')
  store.getState().press()
  store.getState().finish()
  store.getState().cancel()
  assert.equal(store.getState().action, 'draw')
  assert.equal(store.getState().held, false)
  assert.equal(store.getState().burst, 0)
  store.getState().finish()
  assert.equal(store.getState().action, 'idle')
})
test('knife swings repeat only at the end of a complete swing; firearms retain reload', () => {
  const knife = ready('knife')
  knife.getState().press()
  const first = knife.getState().restart
  knife.getState().finish()
  assert.equal(knife.getState().action, 'fire')
  assert.equal(knife.getState().restart, first + 1)
  knife.getState().release()
  knife.getState().finish()
  assert.equal(knife.getState().action, 'idle')
  const rifle = ready('firearm')
  rifle.getState().press()
  rifle.getState().reload()
  assert.equal(rifle.getState().action, 'reload')
  assert.equal(rifle.getState().held, false)
  rifle.getState().finish()
  assert.equal(rifle.getState().action, 'idle')
})
test('separate preview instances never inherit held state, animation or explosion counters', () => {
  const a = ready('grenade'),
    b = ready('grenade')
  a.getState().press()
  assert.equal(b.getState().action, 'idle')
  assert.equal(b.getState().held, false)
  assert.equal(b.getState().burst, 0)
})

const { isSkinPreviewAudio } = await import('../src/shared/skin-preview-audio.ts')
test('audio previews reject truncated, non-WAV and oversized responses before decoding', () => {
  const bytes = new Uint8Array(44)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WAVE'), 8)
  assert.equal(isSkinPreviewAudio(bytes.buffer), true)
  assert.equal(isSkinPreviewAudio(bytes.buffer.slice(0, 12)), false)
  assert.equal(isSkinPreviewAudio(new ArrayBuffer(44)), false)
  const big = new Uint8Array(5 * 1024 * 1024 + 1)
  big.set(bytes)
  assert.equal(isSkinPreviewAudio(big.buffer), false)
})
