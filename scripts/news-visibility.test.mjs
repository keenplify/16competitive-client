/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

const source = ts.transpileModule(
  await readFile(new URL('../src/renderer/src/features/news/news-visibility.store.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
).outputText

async function harness() {
  let getVisibility = async () => ({ popupEnabled: true, railEnabled: true })
  const context = vm.createContext({
    console: { error: () => {} },
    window: { api: { news: { getVisibility: () => getVisibility() } } }
  })
  const module = new vm.SourceTextModule(source, { context })
  await module.link(
    () => new vm.SyntheticModule(['create'], function () { this.setExport('create', create) }, { context })
  )
  await module.evaluate()
  const store = module.namespace.useNewsVisibilityStore
  return { store, respond: (fn) => { getVisibility = fn } }
}

test('admin settings independently hide the popup and Play rail', async () => {
  const h = await harness()
  assert.equal(h.store.getState().visibility, null)
  h.respond(async () => ({ popupEnabled: false, railEnabled: true }))
  await h.store.getState().refresh()
  assert.equal(h.store.getState().visibility.popupEnabled, false)
  assert.equal(h.store.getState().visibility.railEnabled, true)
  h.respond(async () => ({ popupEnabled: true, railEnabled: false }))
  await h.store.getState().refresh()
  assert.equal(h.store.getState().visibility.popupEnabled, true)
  assert.equal(h.store.getState().visibility.railEnabled, false)
})

test('a failed refresh retains the last setting; an older API keeps existing visibility', async () => {
  const h = await harness()
  h.respond(async () => { throw new Error('offline') })
  await h.store.getState().refresh()
  assert.equal(h.store.getState().visibility.popupEnabled, true)
  h.respond(async () => ({ popupEnabled: false, railEnabled: false }))
  await h.store.getState().refresh()
  h.respond(async () => { throw new Error('offline') })
  await h.store.getState().refresh()
  assert.equal(h.store.getState().visibility.popupEnabled, false)
  assert.equal(h.store.getState().visibility.railEnabled, false)
})
