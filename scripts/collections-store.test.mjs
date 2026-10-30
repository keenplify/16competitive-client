import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function fixture(api) {
  const auth = create((set) => ({
    session: { player: { id: 'account-a' } },
    points: 1000,
    setPoints: (points) => set({ points })
  }))
  const payments = create(() => ({ snapshot: { pCash: 1000 } }))
  const context = vm.createContext({
    window: { api: { skins: api } },
    crypto: { randomUUID },
    Error,
    console
  })
  const code = ts.transpileModule(
    await readFile(
      new URL('../src/renderer/src/features/skins/collections.store.ts', import.meta.url),
      'utf8'
    ),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
  ).outputText
  const module = new vm.SourceTextModule(code, { context })
  await module.link((name) => {
    const exports =
      name === 'zustand'
        ? { create }
        : name.includes('auth.store')
          ? { useAuthStore: auth }
          : { usePaymentsStore: payments }
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return { store: module.namespace.useCollectionsStore, auth, payments }
}
const quote = {
  currency: 'P_CASH',
  quoteHash: 'a'.repeat(64),
  total: 100,
  subtotal: 125,
  items: [{ skinId: 'one', price: 100 }]
}
const detail = { collection: { id: 'sample' }, items: [{ id: 'one', owned: false }] }
test('uncertain package settlement retains the original request key and cannot double-submit', async () => {
  const keys = []
  let settle,
    count = 0
  const { store, payments } = await fixture({
    collection: async () => detail,
    collectionQuote: async () => quote,
    collectionBuy: async (_id, input) => {
      keys.push(input.requestKey)
      if (!count++) {
        await new Promise((resolve) => {
          settle = resolve
        })
        throw new Error('connection lost')
      }
      return { pCash: 900, points: 1000 }
    }
  })
  await store.getState().open('sample')
  const first = store.getState().buy()
  await store.getState().buy()
  assert.equal(keys.length, 1)
  settle()
  await first
  assert.equal(store.getState().notice, 'error')
  assert.ok(store.getState().request)
  await store.getState().buy()
  assert.deepEqual(keys, [keys[0], keys[0]])
  assert.equal(store.getState().request, null)
  assert.equal(payments.getState().snapshot.pCash, 900)
  assert.equal(store.getState().detail.items[0].owned, true)
})
test('an account change discards a late purchase response and wallet updates', async () => {
  let finish
  const { store, auth, payments } = await fixture({
    collection: async () => detail,
    collectionQuote: async () => quote,
    collectionBuy: () =>
      new Promise((resolve) => {
        finish = resolve
      })
  })
  await store.getState().open('sample')
  const purchase = store.getState().buy()
  auth.setState({ session: { player: { id: 'account-b' } }, points: 777 })
  finish({ points: 500, pCash: 500 })
  await purchase
  assert.equal(store.getState().selectedId, null)
  assert.equal(store.getState().request, null)
  assert.equal(auth.getState().points, 777)
  assert.equal(payments.getState().snapshot.pCash, 1000)
})
test('a stale quote rejection allows review of a fresh quote before a new purchase', async () => {
  let quoted = 0
  const { store } = await fixture({
    collection: async () => detail,
    collectionQuote: async () => ({
      ...quote,
      total: 100 + quoted++,
      quoteHash: String(quoted).repeat(64)
    }),
    collectionBuy: async () => {
      throw new Error('COLLECTION_QUOTE_CHANGED')
    }
  })
  await store.getState().open('sample')
  await store.getState().buy()
  assert.equal(store.getState().request, null)
  assert.equal(store.getState().notice, 'changed')
  assert.equal(store.getState().quoteStatus, 'error')
  await store.getState().refreshQuote()
  assert.equal(store.getState().quote.total, 101)
  assert.equal(store.getState().notice, null)
})
