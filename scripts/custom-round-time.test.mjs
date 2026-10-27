import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/main/custom-games.ts', import.meta.url), 'utf8')
const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    source + '\nexport { validateSettings, validateSettingsUpdate, isRoundTime }',
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }
  ).outputText,
  {
    exports,
    require: (name) =>
      name === '../shared/custom-games'
        ? { isCustomGameMode: (value) => ['unrated', 'arena', 'ffa'].includes(value) }
        : {}
  }
)
const settings = { name: 'Custom match', mode: 'unrated', mapId: 'de_dust2' }

test('desktop custom game creation and updates preserve round time and default reset', () => {
  for (const roundTimeMinutes of [1, 1.92, 2.5, 9, null]) {
    assert.equal(
      exports.validateSettings({ ...settings, roundTimeMinutes }).roundTimeMinutes,
      roundTimeMinutes
    )
    assert.equal(
      exports.validateSettingsUpdate({ roundTimeMinutes }).roundTimeMinutes,
      roundTimeMinutes
    )
  }
  assert.equal('roundTimeMinutes' in exports.validateSettings(settings), false)
  assert.equal('roundTimeMinutes' in exports.validateSettingsUpdate({ name: 'Rename' }), false)
})

test('IPC rejects invalid round timers rather than forwarding or silently dropping them', () => {
  for (const roundTimeMinutes of [0, 0.99, 9.01, 2.555, NaN, Infinity, '2.5', {}, true]) {
    assert.throws(
      () => exports.validateSettings({ ...settings, roundTimeMinutes }),
      /Invalid round time/
    )
    assert.throws(() => exports.validateSettingsUpdate({ roundTimeMinutes }), /Invalid round time/)
    assert.equal(exports.isRoundTime(roundTimeMinutes), false)
  }
})
