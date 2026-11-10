import { gameModeFallback } from '../src/shared/game-mode-preference.ts'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { create } from 'zustand'
const source = ts.transpile(
  readFileSync(
    new URL(
      '../src/renderer/src/features/settings/partner-game-preference.store.ts',
      import.meta.url
    ),
    'utf8'
  ),
  { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
)
function harness(storage = new Map()) {
  const exports = {}
  new Function('require', 'exports', 'sessionStorage', source)(() => ({ create }), exports, {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  })
  return { ...exports, storage }
}
test('game preference restores only for the same account and tab, and clears on logout', () => {
  const a = harness()
  a.usePartnerGamePreferenceStore.getState().apply('account-a', 'cs13')
  const reload = harness(a.storage)
  reload.restorePartnerGamePreference('account-a')
  assert.equal(reload.usePartnerGamePreferenceStore.getState().game, 'cs13')
  reload.restorePartnerGamePreference('account-b')
  assert.equal(reload.usePartnerGamePreferenceStore.getState().game, null)
  reload.restorePartnerGamePreference(null)
  reload.restorePartnerGamePreference('account-a')
  assert.equal(reload.usePartnerGamePreferenceStore.getState().game, null)
  assert.equal(a.storage.size, 0)
})
test('a handoff without a game clears the earlier preference; malformed storage is ignored', () => {
  const a = harness()
  a.usePartnerGamePreferenceStore.getState().apply('a', 'cs16')
  a.usePartnerGamePreferenceStore.getState().apply('a', null)
  assert.equal(a.storage.size, 0)
  a.storage.set('16c.partner-game-preference.v1', '{broken')
  a.restorePartnerGamePreference('a')
  assert.equal(a.usePartnerGamePreferenceStore.getState().game, null)
})

test('missing helper or maps never falls back from a partner CS13 session to CS16', () => {
  const modes = ['5v5', 'unrated', 'cs13_3v3', 'ffa']
  assert.equal(gameModeFallback(modes, ['5v5', 'unrated'], 'cs13'), 'cs13_3v3')
  assert.equal(gameModeFallback(modes, [], 'cs13'), 'cs13_3v3')
  assert.equal(gameModeFallback(modes, ['cs13_3v3'], 'cs16'), '5v5')
  assert.equal(gameModeFallback(modes, ['unrated'], null), 'unrated')
  assert.equal(gameModeFallback(modes, [], null), undefined)
})
