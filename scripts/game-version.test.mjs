import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parseGameVersion, gameForMode, supportsWeapon } from '../src/shared/game-version.ts'

test('configured games support independent desktop and web installations', async () => {
  const source = ts.transpileModule(
    readFileSync(
      new URL('../src/renderer/src/features/settings/game-availability.ts', import.meta.url),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
  for (const web of [true, false]) {
    for (const games of [[], ['cs13'], ['cs16'], ['cs16', 'cs13']]) {
      const exports = {}
      const api = {
        matchmaking: {
          nativeHelperSettings: async () => ({
            cs16FolderPath: games.includes('cs16') ? '/cs16' : null,
            cs13FolderPath: games.includes('cs13') ? '/cs13' : null
          })
        },
        gameSettings: {
          get: async () => ({ cs16ExecutablePath: games.includes('cs16') ? '/cs16/hl' : null })
        },
        legacyGame: {
          get: async () => {
            assert.equal(web, false, 'web must use native helper settings')
            return { ok: true, value: { installation: games.includes('cs13') ? {} : null } }
          }
        }
      }
      new Function('require', 'exports', 'window', source)(
        () => ({ isWebRuntime: () => web }),
        exports,
        { api }
      )
      assert.deepEqual(await exports.configuredGames(), games)
    }
  }
})

test('old clients default to CS 1.6 while invalid versions fail closed', () => {
  assert.equal(parseGameVersion(), 'cs16')
  for (const game of ['cs13', 'cs16']) assert.equal(parseGameVersion(game), game)
  for (const game of [null, '', 'cs15', {}, 13]) assert.throws(() => parseGameVersion(game))
})
test('queue and reconnect resolve both legacy modes to CS 1.3', () => {
  for (const mode of ['cs13_3v3', 'cs13_1v1']) assert.equal(gameForMode(mode), 'cs13')
  for (const mode of ['5v5', 'ffa', 'arena', '3v3']) assert.equal(gameForMode(mode), 'cs16')
})
test('CS 1.3 cannot select later weapons or character loadouts', () => {
  for (const key of ['famas', 'galil', 'shield', 'player_ct', 'player_t']) {
    assert.equal(supportsWeapon('cs13', key), false)
    assert.equal(supportsWeapon('cs16', key), true)
  }
  for (const key of ['ak47', 'knife', 'm4a1']) assert.equal(supportsWeapon('cs13', key), true)
})
