/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

async function harness(getSummary = async (id) => ({ id, players: [] })) {
  const context = vm.createContext({
    console,
    window: { api: { matchHistory: { getSummary, getPlayerProfile: async (id) => ({ id }) } } }
  })
  const zustand = new vm.SyntheticModule(
    ['create'],
    function () {
      this.setExport('create', create)
    },
    { context }
  )
  const modules = new Map()
  async function load(name) {
    if (modules.has(name)) return modules.get(name)
    const source = await readFile(
      new URL(`../src/renderer/src/features/profile/${name}.ts`, import.meta.url),
      'utf8'
    )
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
    }).outputText
    const module = new vm.SourceTextModule(code, { context })
    modules.set(name, module)
    await module.link((dep) => (dep === 'zustand' ? zustand : load(dep.replace('./', ''))))
    return module
  }
  const profileModule = await load('profile.store')
  await profileModule.evaluate()
  return {
    profile: profileModule.namespace.useProfileStore,
    match: modules.get('match-details.store').namespace.useMatchDetailsStore
  }
}

test('nested match → profile → history → match → profile unwinds to the correct tab and match', async () => {
  const { profile, match } = await harness()
  await match.getState().open('first-match')
  match.getState().close()
  profile.getState().openFromMatch('alice', 'first-match')
  profile.getState().setTab('matches')
  await match.getState().open('alice-match')
  match.getState().close()
  profile.getState().openFromMatch('bob', 'alice-match')
  profile.getState().setTab('matches')
  profile.getState().close()
  assert.equal(profile.getState().selectedId, 'alice')
  assert.equal(profile.getState().tab, 'matches')
  assert.equal(match.getState().id, 'alice-match')
  match.getState().close()
  profile.getState().close()
  assert.equal(profile.getState().selectedId, null)
  assert.equal(match.getState().id, 'first-match')
})

test('old match responses cannot overwrite a new match or reopen a dismissed popup', async () => {
  const resolve = new Map()
  const { match } = await harness((id) => new Promise((done) => resolve.set(id, done)))
  const first = match.getState().open('first')
  const second = match.getState().open('second')
  resolve.get('second')({ id: 'second', players: [] })
  await second
  resolve.get('first')({ id: 'first', players: [] })
  await first
  assert.equal(match.getState().summary.id, 'second')
  const third = match.getState().open('third')
  match.getState().close()
  resolve.get('third')({ id: 'third', players: [] })
  await third
  assert.equal(match.getState().id, null)
  assert.equal(match.getState().summary, null)
})

test('dismiss clears nested profile history without reopening an earlier match', async () => {
  const { profile, match } = await harness()
  profile.getState().openFromMatch('alice', 'first-match')
  profile.getState().openFromMatch('bob', 'second-match')
  profile.getState().dismiss()
  assert.equal(profile.getState().selectedId, null)
  assert.equal(profile.getState().returnPoints.length, 0)
  assert.equal(match.getState().id, null)
  profile.getState().open('carol')
  profile.getState().close()
  assert.equal(match.getState().id, null)
})
