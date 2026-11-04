import assert from 'node:assert/strict'
import test from 'node:test'
import { isCustomGameChatMessage } from '../src/shared/custom-games.ts'

const message = {
  id: '00000000-0000-4000-8000-000000000001',
  roomId: '00000000-0000-4000-8000-000000000002',
  sender: { id: 'player', username: 'Player' },
  message: 'Player joined the room.',
  sentAt: '2026-11-03T00:00:00.000Z'
}

test('room chat accepts legacy messages and known membership events only', () => {
  assert.equal(isCustomGameChatMessage(message), true)
  for (const event of ['member_joined', 'member_left']) {
    assert.equal(isCustomGameChatMessage({ ...message, event }), true)
  }
  for (const event of ['unknown', null, {}, 1]) {
    assert.equal(isCustomGameChatMessage({ ...message, event }), false)
  }
  assert.equal(isCustomGameChatMessage({ ...message, event: 'member_joined', sender: null }), false)
  assert.equal(
    isCustomGameChatMessage({ ...message, event: 'member_left', sentAt: 'invalid' }),
    false
  )
})
