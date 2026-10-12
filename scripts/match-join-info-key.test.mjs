import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchConfigLaunchArgs,
  matchJoinInfoKey,
  matchJoinInfoCleanupCommands,
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

test('startup exec waits for managed cleanup before adding match identity', () => {
  assert.deepEqual(matchJoinLaunchArgs('match', 'private-token', 'startup-exec'), [])
})

test('legacy connection budget fits after removing unused Half-Life model/color fields', () => {
  const key = matchJoinInfoKey('match')
  const cleanup = matchJoinInfoCleanupCommands([key, key])
  assert.equal(cleanup.filter((command) => command.includes(key)).length, 1)
  // Runtime fields observed in the affected OlagueR installation, without
  // inspecting any saved player configuration.
  const info = new Map([
    ['_cl_autowepswitch', '1'],
    ['cl_dlmax', '512'],
    ['cl_lc', '1'],
    ['cl_lw', '1'],
    ['name', 'keenplify'],
    ['_vgui_menus', '1'],
    ['_ah', '1'],
    ['lefthand', '1'],
    ['_pw', 'repack'],
    ['cl_updaterate', '101'],
    ['rate', '20000'],
    ['hwp', '1'],
    ['model', 'gordon'],
    ['topcolor', '30'],
    ['bottomcolor', '6'],
    ['_16c', 'm_'.padEnd(50, 'a')]
  ])
  // JavaScript test helpers cannot use TypeScript return annotations.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const bytes = () => [...info].reduce((size, [k, v]) => size + k.length + v.length + 2, 0)
  info.delete('_16c')
  info.set(key, 'a'.repeat(32))
  assert.ok(bytes() + 42 >= 256, 'password insertion fails without budget cleanup')
  for (const command of cleanup) info.delete(command.match(/^setinfo "([^"]+)" ""$/)[1])
  info.set(key, 'a'.repeat(32))
  info.set('password', 'a'.repeat(32))
  assert.ok(bytes() < 256)
  assert.equal(info.get('_pw'), 'repack')
  assert.equal(info.get('_vgui_menus'), '1')
})
