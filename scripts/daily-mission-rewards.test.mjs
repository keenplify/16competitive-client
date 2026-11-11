import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDailyQuestReward } from '../src/shared/daily-quests.ts'

test('missions validate all four reward types before using artwork or model metadata', () => {
  for (const type of ['POINTS', 'P_CASH'])
    assert.equal(isDailyQuestReward({ type, amount: 1 }), true)
  const sticker = {
    type: 'STICKER',
    amount: 1,
    stickerId: 'sticker',
    name: 'Sticker',
    imagePath: `media/16competitive/stickers/${'a'.repeat(64)}/image.png`
  }
  assert.equal(isDailyQuestReward(sticker), true)
  for (const imagePath of [
    '../image.png',
    'https://evil.test/image.png',
    sticker.imagePath + '/../../secret'
  ])
    assert.equal(isDailyQuestReward({ ...sticker, imagePath }), false)
  for (const amount of [0, -1, 1.5, NaN, Infinity, 101])
    assert.equal(isDailyQuestReward({ ...sticker, amount }), false)
  const skin = {
    type: 'SKIN',
    amount: 1,
    skinId: '12345678-1234-1234-1234-123456789abc',
    name: 'Skin',
    weaponKey: 'ak47',
    previewRotation: [0, 0, 0],
    previewHiddenTextures: []
  }
  assert.equal(isDailyQuestReward(skin), true)
  assert.equal(isDailyQuestReward({ ...skin, previewRotation: [0, Infinity, 0] }), false)
  assert.equal(isDailyQuestReward({ ...skin, previewHiddenTextures: Array(65).fill('x') }), false)
  assert.equal(isDailyQuestReward(null), false)
})
