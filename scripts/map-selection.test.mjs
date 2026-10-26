/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { isMatchmakingMode } from '../src/shared/matchmaking.ts'

const directory = new URL('../src/renderer/src/features/matchmaking/', import.meta.url)
function harness() {
  const memory = new Map()
  const window = {
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value)
    }
  }
  const compile = (source) =>
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText
  const preferences = {}
  new Function(
    'require',
    'exports',
    'window',
    compile(readFileSync(new URL('matchmaking-preferences.ts', directory), 'utf8'))
  )(() => ({ isMatchmakingMode }), preferences, window)
  const source = readFileSync(new URL('matchmaking.store.ts', directory), 'utf8')
  const ast = ts.createSourceFile('store.ts', source, ts.ScriptTarget.Latest, true)
  const selection = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'selectedMapsForMode'
  )
  const exported = {}
  new Function(
    'readMatchmakingPreferences',
    'saveMatchmakingPreferences',
    'exports',
    compile('export ' + selection.getText(ast))
  )(preferences.readMatchmakingPreferences, preferences.saveMatchmakingPreferences, exported)
  return { ...preferences, select: exported.selectedMapsForMode }
}
const map = (id, feedbackEnabled = false) => ({ id, feedbackEnabled })

test('new regular and review maps default on once; deselections survive refresh and restart', () => {
  const h = harness()
  const initial = [map('dust2'), map('inferno')]
  assert.deepEqual(h.select('player', '5v5', initial), ['dust2', 'inferno'])
  h.saveMatchmakingPreferences('player', { mode: '5v5', mapIds: ['dust2'] })
  const expanded = [...initial, map('train'), map('new-review', true)]
  assert.deepEqual(h.select('player', '5v5', expanded), ['dust2', 'train', 'new-review'])
  h.saveMatchmakingPreferences('player', { mode: '5v5', mapIds: ['dust2'] })
  assert.deepEqual(h.select('player', '5v5', expanded), ['dust2'])
  assert.deepEqual(h.select('player', '5v5', [map('dust2'), map('train')]), ['dust2'])
  assert.deepEqual(h.select('player', '5v5', expanded), ['dust2'])
})

test('map history and selections are scoped to the account and mode', () => {
  const h = harness()
  const maps = [map('dust2'), map('inferno')]
  h.select('one', '5v5', maps)
  h.saveMatchmakingPreferences('one', { mode: '5v5', mapIds: [] })
  assert.deepEqual(h.select('one', '5v5', maps), [])
  assert.deepEqual(h.select('two', '5v5', maps), ['dust2', 'inferno'])
  assert.deepEqual(h.select('one', 'unrated', maps), ['dust2', 'inferno'])
})

test('legacy preferences preserve regular deselections and previously offered review maps', () => {
  const h = harness()
  h.saveMatchmakingPreferences('old', {
    mode: '5v5',
    mapIds: ['dust2'],
    seenReviewMapIds: ['review']
  })
  const maps = [map('dust2'), map('inferno'), map('review', true), map('fresh-review', true)]
  assert.deepEqual(h.select('old', '5v5', maps), ['dust2', 'fresh-review'])
  assert.deepEqual(h.select('old', '5v5', [...maps, map('new-regular')]), [
    'dust2',
    'fresh-review',
    'new-regular'
  ])
})

test('anonymous and unavailable storage retain the all-maps default', () => {
  const h = harness()
  assert.deepEqual(h.select(undefined, '5v5', [map('dust2'), map('new')]), ['dust2', 'new'])
})
