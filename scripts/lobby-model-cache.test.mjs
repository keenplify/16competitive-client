import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = await mkdtemp(join(tmpdir(), '16c-lobby-cache-'))
const output = join(root, 'cache.mjs')
await build({
  entryPoints: ['src/renderer/src/features/party/lobby-model-cache.ts'],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent'
})
after(async () => {
  delete globalThis.indexedDB
  delete globalThis.window
  await rm(root, { recursive: true, force: true })
})
globalThis.window = { api: { updater: { getCurrentVersion: async () => 'fixture' } } }

test('a stalled browser cache cannot hold the first lobby model indefinitely', async () => {
  globalThis.indexedDB = { open: () => new EventTarget() }
  const cache = await import(pathToFileURL(output) + '?stalled')
  assert.equal(await cache.readCachedLobbyPresentation('player'), null)
  const presentation = { meshes: [], textures: [] }
  const pending = cache.writeCachedLobbyPresentation('player', presentation)
  assert.equal(await cache.readCachedLobbyPresentation('player'), presentation)
  await pending
})

test('blocked database upgrades fall back without waiting for another tab to close', async () => {
  globalThis.indexedDB = {
    open: () => {
      const request = new EventTarget()
      queueMicrotask(() => request.dispatchEvent(new Event('blocked')))
      return request
    }
  }
  const cache = await import(pathToFileURL(output) + '?blocked')
  assert.equal(await cache.readCachedLobbyPresentation('player'), null)
})

test('transaction completion is observed even before request continuations run', async () => {
  const cached = { meshes: [], textures: [] }
  const db = {
    transaction: () => {
      const tx = new EventTarget()
      tx.objectStore = (store) => ({
        get: () => {
          const request = new EventTarget()
          request.result = store === 'metadata' ? 'fixture' : cached
          queueMicrotask(() => {
            request.dispatchEvent(new Event('success'))
            tx.dispatchEvent(new Event('complete'))
          })
          return request
        },
        clear: () => {},
        put: () => {}
      })
      return tx
    }
  }
  globalThis.indexedDB = {
    open: () => {
      const request = new EventTarget()
      request.result = db
      queueMicrotask(() => request.dispatchEvent(new Event('success')))
      return request
    }
  }
  const cache = await import(pathToFileURL(output) + '?completion')
  assert.deepEqual(await cache.readCachedLobbyPresentation('player'), cached)
})
