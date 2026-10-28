/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

function harness() {
  const stored = new Map()
  const exports = {}
  const source = ts.transpileModule(
    readFileSync(
      new URL(
        '../src/renderer/src/features/partner-branding/partner-servers.store.ts',
        import.meta.url
      ),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key)
  }
  new Function('require', 'exports', 'window', source)(
    (name) => {
      if (name === 'zustand') return { create }
      if (name === 'zustand/middleware') return { createJSONStorage, persist }
      return {}
    },
    exports,
    { localStorage: storage }
  )
  return { createStore: exports.createPartnerServersStore, stored }
}

test('community server filter survives reload, is scoped per community, and excludes server/account state', () => {
  const { createStore, stored } = harness()
  const first = createStore('one')
  first.setState({
    rows: [{ id: 'private-server' }],
    accountId: 'account',
    selectedId: 'private-server'
  })
  first.getState().setGameFilter('cs13')
  assert.equal(createStore('one').getState().gameFilter, 'cs13')
  assert.equal(createStore('two').getState().gameFilter, 'all')
  const saved = JSON.parse(stored.get('16competitive.community-server-filter.one'))
  assert.deepEqual(saved.state, { gameFilter: 'cs13' })
})

test('invalid saved filters fall back to All', () => {
  const { createStore, stored } = harness()
  stored.set(
    '16competitive.community-server-filter.one',
    JSON.stringify({ state: { gameFilter: 'unknown' }, version: 0 })
  )
  assert.equal(createStore('one').getState().gameFilter, 'all')
})
