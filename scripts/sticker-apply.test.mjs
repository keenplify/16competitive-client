import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

test('main-process apply sends every supported stock weapon and rejects unknown targets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sticker-apply-'))
  const originalFetch = globalThis.fetch
  try {
    const outfile = join(dir, 'main.mjs')
    const mocks = {
      electron: 'export const shell = {}',
      './auth': 'export const getSessionToken=()=>"fixture"; export const clearSessionToken=()=>{}',
      './matchmaking': 'export const matchmakingConnection={getActiveApiUrl:()=>null}',
      './matchmaking-regions':
        'export const resolvePreferredMatchmakingApiUrl=async()=>"https://fixture.invalid"',
      './skin-preview-cache':
        'export const readCachedSkinPreview=()=>null; export const writeCachedSkinPreview=()=>{}'
    }
    await build({
      entryPoints: ['src/main/skins.ts'],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      plugins: [
        {
          name: 'fixtures',
          setup(b) {
            b.onResolve({ filter: /.*/ }, (args) =>
              Object.hasOwn(mocks, args.path)
                ? { path: args.path, namespace: 'fixture' }
                : undefined
            )
            b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
              contents: mocks[args.path],
              loader: 'js'
            }))
          }
        }
      ]
    })
    const { applySticker } = await import(pathToFileURL(outfile).href)
    const catalogFile = join(dir, 'catalog.mjs')
    await build({
      entryPoints: ['src/shared/stock-sticker-models.ts'],
      outfile: catalogFile,
      bundle: true,
      platform: 'node',
      format: 'esm'
    })
    const { STOCK_STICKER_MODELS } = await import(pathToFileURL(catalogFile).href)
    const requests = []
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init })
      return Response.json({ ok: true })
    }
    const id = '11111111-1111-4111-8111-111111111111'
    const projection = {
      center: [0, 0, 0],
      right: [1, 0, 0],
      up: [0, 1, 0],
      normal: [0, 0, 1],
      size: 0.2,
      angle: 0
    }
    for (const key of Object.keys(STOCK_STICKER_MODELS)) {
      await applySticker(id, `stock:${key}`, projection)
      const request = requests.at(-1)
      assert.equal(request.url, `https://fixture.invalid/stickers/items/${id}/apply`)
      assert.equal(request.init.method, 'POST')
      assert.deepEqual(JSON.parse(request.init.body), { weaponKey: `stock:${key}`, projection })
    }
    assert.equal(requests.length, 28)
    for (const key of ['stock:unknown', 'stock:../knife', 'stock:constructor', null])
      await assert.rejects(applySticker(id, key, projection), /STICKER_WEAPON_INVALID/)
    assert.equal(requests.length, 28)
  } finally {
    globalThis.fetch = originalFetch
    await rm(dir, { recursive: true, force: true })
  }
})
