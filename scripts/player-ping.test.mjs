import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_PLAYER_PING_KEY,
  parsePlayerPingKey,
  playerPingCommands
} from '../src/shared/player-ping.ts'

test('middle mouse is the default and only whitelisted keys reach game commands', () => {
  assert.equal(DEFAULT_PLAYER_PING_KEY, 'MOUSE3')
  assert.deepEqual(playerPingCommands(DEFAULT_PLAYER_PING_KEY), [
    'bind "MOUSE3" "cmd 16competitive_ping"'
  ])
  assert.deepEqual(playerPingCommands('NONE'), [])
  for (const value of [undefined, null, {}, 'MOUSE3;quit', 'MOUSE3\nquit', '"MOUSE3"', 'MOUSE1']) {
    assert.throws(() => parsePlayerPingKey(value))
    assert.throws(() => playerPingCommands(value))
  }
})
