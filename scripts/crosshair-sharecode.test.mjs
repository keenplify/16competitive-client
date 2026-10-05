import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getCs2Crosshair,
  importCrosshairShareCode,
  parseCrosshairProfile,
  serializeCrosshairConfig,
  updateCs2Crosshair,
  upgradeCrosshairToCs2
} from '../src/shared/crosshair.ts'

const example = 'CSDcomrJBKpqwRGP3676xoNKTGhHdCOaZ6xY5v5wUQHzyD'

test('imports the current CS2 code and keeps its exact settings', () => {
  const profile = importCrosshairShareCode(example)
  assert.equal(profile.shareCode, example)
  assert.equal(profile.color, '#32FA32')
  assert.deepEqual(
    (({ style, length, gap, thickness, screenHeight, outlineMode }) => ({
      style,
      length,
      gap,
      thickness,
      screenHeight,
      outlineMode
    }))(getCs2Crosshair(profile)),
    { style: 4, length: 2, gap: 0, thickness: 2, screenHeight: 1080, outlineMode: 1 }
  )
  assert.equal(
    serializeCrosshairConfig(profile),
    'cs2 50 250 50 255 0 0 0 255 4 2 0 2 1 0 0 0 1080 255 3 0 100 100 100 0\n'
  )
  assert.equal(parseCrosshairProfile(JSON.parse(JSON.stringify(profile))).shareCode, example)
})

test('edits a CS2 code and rejects corrupted codes', () => {
  const edited = updateCs2Crosshair(importCrosshairShareCode(example), {
    length: 7,
    tStyleEnabled: true
  })
  assert.equal(getCs2Crosshair(edited).length, 7)
  assert.equal(getCs2Crosshair(edited).tStyleEnabled, true)
  assert.throws(() => importCrosshairShareCode(`${example.slice(0, -1)}A`))
})

test('preserves existing JSON profiles and converts them on request', () => {
  const old = parseCrosshairProfile({
    version: 1,
    color: '#50ff62',
    size: 8,
    gap: 4,
    thickness: 2,
    outline: 1,
    opacity: 100,
    dot: false,
    dynamic: false
  })
  assert.equal(serializeCrosshairConfig(old), '80 255 98 8 4 2 1 100 0 0\n')
  const upgraded = upgradeCrosshairToCs2(old)
  assert.equal(getCs2Crosshair(upgraded).length, 16)
  assert.equal(getCs2Crosshair(upgraded).screenHeight, 768)
})
