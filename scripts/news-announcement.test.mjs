/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

const source = ts.transpileModule(
  await readFile(
    new URL('../src/renderer/src/features/news/news-announcement.store.ts', import.meta.url),
    'utf8'
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
).outputText
const post = (id, day) => ({
  id,
  createdAt: `2026-10-${day}T00:00:00Z`,
  content: '<p>News</p>',
  url: 'https://mastodon.social/test',
  mediaUrl: null
})

async function harness(storage = new Map()) {
  let fetchPosts = async () => []
  const context = vm.createContext({
    console: { error: () => {} },
    window: {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value)
      },
      api: { news: { getAll: () => fetchPosts() } }
    }
  })
  const module = new vm.SourceTextModule(source, { context })
  await module.link(
    () =>
      new vm.SyntheticModule(
        ['create'],
        function () {
          this.setExport('create', create)
        },
        { context }
      )
  )
  await module.evaluate()
  const store = module.namespace.useNewsAnnouncementStore
  return {
    store,
    state: () => store.getState(),
    storage,
    fetch: (fn) => {
      fetchPosts = fn
    }
  }
}

test('dismissed news stays dismissed after refresh, account changes, and restart; new posts appear', async () => {
  const h = await harness()
  h.fetch(async () => [post('10', '10'), post('12', '12')])
  h.state().setAccount('alice')
  await h.state().refresh()
  assert.equal(h.state().post.id, '12')
  h.state().dismiss()
  await h.state().refresh()
  assert.equal(h.state().post, null)
  h.state().setAccount('bob')
  await h.state().refresh()
  assert.equal(h.state().post.id, '12')
  h.state().setAccount('alice')
  await h.state().refresh()
  assert.equal(h.state().post, null)
  const restart = await harness(h.storage)
  restart.fetch(async () => [post('12', '12')])
  restart.state().setAccount('alice')
  await restart.state().refresh()
  assert.equal(restart.state().post, null)
  restart.fetch(async () => [post('13', '13')])
  await restart.state().refresh()
  assert.equal(restart.state().post.id, '13')
})

test('older or invalid posts cannot replay; an open post is preserved during refresh', async () => {
  const h = await harness()
  h.state().setAccount('alice')
  h.fetch(async () => [post('12', '12')])
  await h.state().refresh()
  h.fetch(async () => [post('13', '13')])
  await h.state().refresh()
  assert.equal(h.state().post.id, '12')
  h.state().dismiss()
  await h.state().refresh()
  assert.equal(h.state().post.id, '13')
  h.state().dismiss()
  h.fetch(async () => [post('10', '10'), { ...post('99', '12'), createdAt: 'invalid' }])
  await h.state().refresh()
  assert.equal(h.state().post, null)
})

test('in-flight responses cannot leak across logout or an account switch', async () => {
  const h = await harness()
  let resolve
  h.fetch(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  h.state().setAccount('alice')
  const pending = h.state().refresh()
  h.state().setAccount(null)
  h.state().setAccount('bob')
  resolve([post('12', '12')])
  await pending
  assert.equal(h.state().playerId, 'bob')
  assert.equal(h.state().post, null)
})

test('feed errors recover without displaying an empty modal', async () => {
  const h = await harness()
  h.state().setAccount('alice')
  h.fetch(async () => {
    throw new Error('offline')
  })
  await h.state().refresh()
  assert.equal(h.state().post, null)
  h.fetch(async () => [post('12', '12')])
  await h.state().refresh()
  assert.equal(h.state().post.id, '12')
})
