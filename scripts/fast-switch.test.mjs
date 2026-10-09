import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fastSwitchCommands, fastSwitchPreference } from '../src/main/game/fast-switch.ts'

test('managed on/off is consistent for config and native launch paths', () => {
  for (const enabled of [true, false]) {
    const settings = { fastSwitchEnabled: enabled, fastSwitchManaged: true }
    assert.equal(fastSwitchPreference(settings), enabled ? '1' : '0')
    assert.deepEqual(fastSwitchCommands(settings), [`hud_fastswitch "${enabled ? 1 : 0}"`])
  }
})

test('Custom Setup leaves the game preference alone even with an old saved value', () => {
  for (const enabled of [true, false]) {
    const settings = { fastSwitchEnabled: enabled, fastSwitchManaged: false }
    assert.equal(fastSwitchPreference(settings), 'inherit')
    assert.deepEqual(fastSwitchCommands(settings), [])
  }
})
