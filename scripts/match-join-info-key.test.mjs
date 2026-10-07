import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchConfigLaunchArgs,
  matchJoinInfoKey,
  matchJoinKeysInConfig,
  matchJoinLaunchArgs,
  matchJoinCleanupConfig
} from '../src/main/game/match-join-info-key.ts'

test('standard GoldSrc explicitly executes the match cfg while NextClient never receives +exec', () => {
  assert.deepEqual(matchConfigLaunchArgs('16competitive_match.cfg', false), [
    '+exec',
    '16competitive_match.cfg'
  ])
  assert.deepEqual(matchConfigLaunchArgs('16competitive_match.cfg', true), [])
})

test('derives a distinct bounded userinfo key for each match', () => {
  const first = matchJoinInfoKey('61f32a61-691b-4dcd-86da-ef133fb800d2')
  const second = matchJoinInfoKey('71f32a61-691b-4dcd-86da-ef133fb800d2')
  assert.match(first, /^_16c_[0-9a-f]{16}$/)
  assert.notEqual(first, second)
  assert.equal(first, matchJoinInfoKey('61f32a61-691b-4dcd-86da-ef133fb800d2'))
  assert.deepEqual(matchJoinLaunchArgs('61f32a61-691b-4dcd-86da-ef133fb800d2', 'token'), [
    '+setinfo',
    first,
    'token'
  ])
})

test('extracts only match-specific keys for clearing after the match', () => {
  const first = matchJoinInfoKey('first-match')
  const second = matchJoinInfoKey('second-match')
  assert.deepEqual(
    matchJoinKeysInConfig(
      `setinfo "${first}" "token"\nsetinfo "_16c" "old"\nsetinfo "${second}" ""\nsetinfo "${first}" "token"\n`
    ),
    [first, second]
  )
  assert.equal(
    matchJoinCleanupConfig([first, second]),
    `setinfo "${first}" ""\nsetinfo "${second}" ""\n`
  )
})

test('native NextClient identity is not injected before the engine reloads its profile', () => {
  assert.deepEqual(matchJoinLaunchArgs('match', 'private-token', 'native-nextclient'), [])
  assert.deepEqual(matchJoinLaunchArgs('match', 'private-token', 'userconfig'), [
    '+setinfo',
    matchJoinInfoKey('match'),
    'private-token'
  ])
})
