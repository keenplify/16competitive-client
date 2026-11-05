/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'
import { betPayout, parsePCashBetSnapshot, validateBetInput } from '../src/shared/pcash-bets.ts'

const id = '00000000-0000-4000-8000-000000000001'
const snapshot = { matchId: id, balance: 1000, enabled: true, open: true, partnerBps: 1000, platformBps: 1000, bet: null }
const placed = { ...snapshot, balance: 850, bet: { stake: 150, status: 'PENDING', payout: null, expectedPayout: 240 } }
async function fixture(api) {
  const auth = create(() => ({ session: { player: { id: 'account-a' } } }))
  const payments = create(() => ({ ownerId: 'account-a', snapshot: { pCash: 1000 } }))
  const notices = new Map()
  const toast = { loading: text => { const id = notices.size; notices.set(id, { text, isLoading: true }); return id }, update: (id, value) => notices.set(id, value), dismiss: id => notices.delete(id) }
  const context = vm.createContext({ window: { api: { pCashBets: api } }, Error, console })
  const code = ts.transpileModule(await readFile(new URL('../src/renderer/src/features/matchmaking/pcash-bets.store.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  const module = new vm.SourceTextModule(code, { context })
  await module.link(name => {
    const values = name === 'zustand' ? { create } : name === 'react-toastify' ? { toast } : name.includes('pcash-bets') ? { validateBetInput } : name.includes('auth.store') ? { useAuthStore: auth } : name.includes('payments.store') ? { usePaymentsStore: payments } : { translate: (_language, key) => key, useLanguageStore: { getState: () => ({ language: 'en' }) } }
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value) }, { context })
  })
  await module.evaluate()
  return { store: module.namespace.usePCashBetsStore, auth, payments, notices }
}
test('No bet is the default and loading or selecting never places a stake', async () => {
  let calls = 0
  const { store } = await fixture({ get: async () => snapshot, place: async () => { calls++; return placed } })
  await store.getState().load(id)
  assert.equal(store.getState().amount, '0')
  store.getState().setAmount('150')
  assert.equal(calls, 0)
})
test('a pending confirmation blocks duplicate requests and resolves its toast and wallet balance', async () => {
  let finish, calls = 0
  const { store, payments, notices } = await fixture({ get: async () => snapshot, place: async () => { calls++; return new Promise(resolve => { finish = resolve }) } })
  await store.getState().load(id)
  store.getState().setAmount('150')
  const pending = store.getState().place()
  assert.equal(store.getState().busy, true)
  assert.equal(await store.getState().place(), false)
  assert.equal(calls, 1)
  finish(placed)
  assert.equal(await pending, true)
  assert.equal(store.getState().busy, false)
  assert.equal(payments.getState().snapshot.pCash, 850)
  assert.equal([...notices.values()][0].isLoading, false)
  assert.equal([...notices.values()][0].type, 'success')
})
test('a lost response is reconciled with the saved stake; declines resolve to error feedback', async () => {
  let committed = false
  const { store, notices } = await fixture({ get: async () => committed ? placed : snapshot, place: async () => { committed = true; throw Error('connection lost') } })
  await store.getState().load(id); store.getState().setAmount('150')
  assert.equal(await store.getState().place(), true)
  assert.equal([...notices.values()][0].type, 'success')
  const failed = await fixture({ get: async () => snapshot, place: async () => { throw Error('BET_INSUFFICIENT_PCASH') } })
  await failed.store.getState().load(id); failed.store.getState().setAmount('150')
  assert.equal(await failed.store.getState().place(), false)
  assert.equal([...failed.notices.values()][0].render, 'bet.insufficient')
  assert.equal([...failed.notices.values()][0].isLoading, false)
})
test('an account switch clears selection and ignores late wallet or stake data', async () => {
  let finish
  const { store, auth, payments, notices } = await fixture({ get: async () => snapshot, place: () => new Promise(resolve => { finish = resolve }) })
  await store.getState().load(id); store.getState().setAmount('150')
  const pending = store.getState().place()
  auth.setState({ session: { player: { id: 'account-b' } } })
  finish(placed)
  assert.equal(await pending, false)
  assert.equal(store.getState().snapshot, null)
  assert.equal(store.getState().amount, '0')
  assert.equal(payments.getState().snapshot.pCash, 1000)
  assert.equal(notices.size, 0)
})
test('server response validation rejects a fake win amount, wrong match and illegal presets', () => {
  assert.equal(betPayout({ stake: 100, partnerBps: 1000, platformBps: 1000 }), 160)
  assert.throws(() => validateBetInput({ stake: 100, partnerBps: 1000, platformBps: 1000 }))
  assert.throws(() => parsePCashBetSnapshot({ ...placed, matchId: 'other' }, id))
  assert.throws(() => parsePCashBetSnapshot({ ...placed, bet: { ...placed.bet, status: 'WON', payout: 100000 } }, id))
  assert.equal(parsePCashBetSnapshot({ ...placed, bet: { ...placed.bet, status: 'WON', payout: 240 } }, id).bet.payout, 240)
})
test('every supported language has the same PCash messages and interpolation fields', async () => {
  const catalog = JSON.parse(await readFile(new URL('../src/shared/pcash-bet-translations.json', import.meta.url), 'utf8'))
  for (const messages of Object.values(catalog)) {
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(catalog.en).sort())
    for (const [key, value] of Object.entries(messages)) assert.deepEqual((value.match(/{{\w+}}/g) ?? []).sort(), (catalog.en[key].match(/{{\w+}}/g) ?? []).sort())
  }
})
