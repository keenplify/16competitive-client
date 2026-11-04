import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

test('thumbnail warmup ignores stale account responses and loads once per account', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-warmup-'))
  const previousWindow = globalThis.window
  try {
    const outfile = join(directory, 'store.mjs')
    await build({
      entryPoints: ['src/renderer/src/features/skins/thumbnail-warmup.store.ts'],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm'
    })
    const requests = []
    globalThis.window = {
      api: { skins: { list: () => new Promise((resolve) => requests.push(resolve)) } }
    }
    const { useThumbnailWarmupStore: store } = await import(pathToFileURL(outfile).href)
    const first = store.getState().load('first')
    await store.getState().load('first')
    assert.equal(requests.length, 1)
    const second = store.getState().load('second')
    requests[0]([{ id: 'old', weaponKey: 'ak47' }])
    await first
    assert.deepEqual(store.getState().skins, [])
    requests[1]([
      { id: 'new', weaponKey: 'knife' },
      { id: 'character', weaponKey: 'player_ct' }
    ])
    await second
    assert.deepEqual(
      store.getState().skins.map((skin) => skin.id),
      ['new']
    )
    store.getState().advance()
    assert.equal(store.getState().index, 1)
    await store.getState().load(null)
    assert.deepEqual(store.getState().skins, [])
    assert.equal(store.getState().index, 0)
  } finally {
    globalThis.window = previousWindow
    await rm(directory, { recursive: true, force: true })
  }
})
