import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultGameDisplayPreferences,
  gameResolutionArgs,
  parseGameDisplayPreferences,
  resolveGameResolution
} from '../src/shared/game-display.ts'

test('automatic defaults to the current display, including widescreen and DPI-sized dimensions', () => {
  for (const current of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 1024, height: 768 }
  ]) {
    const preferences = defaultGameDisplayPreferences(current)
    assert.equal(preferences.resolution, 'current')
    assert.deepEqual(resolveGameResolution(preferences, current), current)
  }
  assert.deepEqual(
    resolveGameResolution(
      { resolution: 'current', widescreen: false },
      { width: 1920, height: 1080 }
    ),
    { width: 1440, height: 1080 }
  )
})

test('manual modes remain fixed while automatic follows a different display', () => {
  const current = { width: 2560, height: 1440 }
  assert.deepEqual(resolveGameResolution({ resolution: '1280x720', widescreen: true }, current), {
    width: 1280,
    height: 720
  })
  assert.deepEqual(gameResolutionArgs(current, 'cs13'), ['-width', '2560', '-height', '1440'])
  assert.deepEqual(gameResolutionArgs(current, 'cs16'), ['-w', '2560', '-h', '1440'])
  assert.deepEqual(
    resolveGameResolution({ resolution: 'current', widescreen: true }, current, 'cs13'),
    { width: 1280, height: 960 }
  )
  assert.deepEqual(
    resolveGameResolution({ resolution: '1280x720', widescreen: true }, current, 'cs13'),
    { width: 800, height: 600 }
  )
})

test('IPC display input rejects command injection, unknown modes and mismatched aspects', () => {
  for (const input of [
    null,
    {},
    [],
    { resolution: '1920x1080;quit', widescreen: true },
    { resolution: '1920x1080', widescreen: false },
    { resolution: '1024x768', widescreen: true },
    { resolution: 'current', widescreen: 'yes' }
  ]) {
    assert.throws(() => parseGameDisplayPreferences(input))
  }
  for (const width of [NaN, Infinity, -1, 1920.5, '1920', 32768])
    assert.throws(() => gameResolutionArgs({ width, height: 1080 }, 'cs13'))
})
