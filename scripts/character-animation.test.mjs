/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  characterAnimationLabels,
  lobbyAnimationIndexFor,
  resolveAnimationIndex
} from '../src/renderer/src/features/party/character-animation.ts'

const model = (...labels) => ({ sequences: labels.map((label) => ({ label })) })
test('party and character previews prefer the matching lobby idle over stock aiming', () => {
  assert.equal(lobbyAnimationIndexFor(model('death', 'ref_aim_ak47', 'idle_rifle'), 'ak47'), 2)
  assert.equal(
    resolveAnimationIndex(
      model('death', 'ref_aim_rifle', 'IDLE_RIFLE'),
      characterAnimationLabels('m4a1')
    ),
    2
  )
})
test('stock models fall back to the appropriate weapon pose', () => {
  for (const [weapon, pose] of [
    ['ak47', 'ak47'],
    ['m4a1', 'rifle'],
    ['elite', 'dualpistols'],
    ['mp5navy', 'mp5'],
    ['hegrenade', 'grenade']
  ]) {
    assert.equal(lobbyAnimationIndexFor(model('death', 'idle1', `ref_aim_${pose}`), weapon), 2)
  }
})
test('custom models without lobby or aiming animations choose idle before first sequence', () => {
  assert.equal(lobbyAnimationIndexFor(model('death', 'idle', 'idle1'), 'ak47'), 2)
  assert.equal(lobbyAnimationIndexFor(model('death', 'IDLE'), 'ak47'), 1)
  assert.equal(lobbyAnimationIndexFor(model('custom_pose'), 'ak47'), 0)
})

test('unrecognized labels fall back to the GoldSrc idle activity', () => {
  assert.equal(
    lobbyAnimationIndexFor(
      {
        sequences: [
          { label: 'death', activity: 20 },
          { label: 'custom_rest', activity: 1 }
        ]
      },
      'ak47'
    ),
    1
  )
})
