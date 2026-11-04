import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { STOCK_STICKER_MODELS, stockStickerModelPath } from '../src/shared/stock-sticker-models.ts'

test('canonical stock sources fit existing native paths and retain all 28 source pins', () => {
  for (const [key, model] of Object.entries(STOCK_STICKER_MODELS)) {
    const path = stockStickerModelPath(key)
    assert.ok(path.length < 64)
    assert.match(path, /^models\/16competitive\/stock\/[a-f0-9]{16}\/v\.mdl$/)
    assert.ok(path.includes(model.sha256.slice(0, 16)))
  }
  assert.equal(Object.keys(STOCK_STICKER_MODELS).length, 28)
  assert.throws(() => stockStickerModelPath('../config.cfg'))
})

test('stock preview only fetches pinned sources and rejects corrupt downloads', async () => {
  const dir = await mkdtemp(join(tmpdir(), '16c-stock-source-'))
  const originalFetch = globalThis.fetch
  try {
    const outfile = join(dir, 'source.cjs')
    await build({
      entryPoints: ['src/main/stock-sticker-source.ts'],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      plugins: [
        {
          name: 'auth-fixture',
          setup(b) {
            b.onResolve({ filter: /^\.\/auth$|^\.\/matchmaking-regions$/ }, (args) => ({
              path: args.path,
              namespace: 'fixture'
            }))
            b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
              contents: args.path.endsWith('/auth')
                ? 'export const getSessionToken=()=>"fixture-token"'
                : 'export const resolvePreferredMatchmakingApiUrl=async()=>"https://regional.example.test"'
            }))
          }
        }
      ]
    })
    const { readStockStickerSource } = createRequire(import.meta.url)(outfile)
    let calls = 0
    globalThis.fetch = async (url, options) => {
      calls++
      assert.equal(url.origin, 'https://regional.example.test')
      assert.equal(url.searchParams.get('path'), stockStickerModelPath('ak47'))
      assert.equal(options.redirect, 'error')
      return new Response(new Uint8Array([1, 2, 3]))
    }
    assert.equal(await readStockStickerSource('models/v_ak47.mdl'), null)
    assert.equal(await readStockStickerSource('../../secret'), null)
    assert.equal(calls, 0)
    await assert.rejects(readStockStickerSource(stockStickerModelPath('ak47')), /UNSUPPORTED/)
    if (process.env.STICKER_TEST_MODEL) {
      const model = await readFile(process.env.STICKER_TEST_MODEL)
      globalThis.fetch = async () => {
        calls++
        return new Response(model)
      }
      const verified = await readStockStickerSource(stockStickerModelPath('ak47'))
      assert.deepEqual(Buffer.from(verified), model)
      new Uint8Array(verified).fill(0)
      assert.deepEqual(
        Buffer.from(await readStockStickerSource(stockStickerModelPath('ak47'))),
        model
      )
      assert.equal(
        calls,
        2,
        'verified cache avoids another download and cannot be mutated by callers'
      )
    }
  } finally {
    globalThis.fetch = originalFetch
    await rm(dir, { recursive: true, force: true })
  }
})
