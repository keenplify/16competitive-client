/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  await fs.readFile('src/main/game/sticker-image-cache.ts', 'utf8'),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }
).outputText
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
  'base64'
)
const hash = crypto.createHash('sha256').update(png).digest('hex')
const key = `media/16competitive/stickers/${hash}/image.png`
async function harness(root, download) {
  const context = vm.createContext({ Buffer, URL, AbortSignal, fetch: download })
  const deps = {
    'node:crypto': crypto,
    'node:fs/promises': fs,
    'node:path': path,
    '../../shared/stickers': {
      stickerImagePath(value) {
        if (!/^media\/16competitive\/stickers\/[a-f0-9]{64}\/image\.png$/.test(value))
          throw new Error('invalid path')
        return value
      }
    },
    './shared-skin-storage': {
      sharedModelDirectory: () => path.join(root, 'models', '16competitive')
    },
    './shared-model-directory': {
      managedAssetDestination: async (root, file) => path.join(root, file)
    }
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link(
    (name) =>
      new vm.SyntheticModule(
        Object.keys(deps[name]),
        function () {
          for (const [key, value] of Object.entries(deps[name])) this.setExport(key, value)
        },
        { context }
      )
  )
  await module.evaluate()
  return module.namespace.cachedStickerImage
}

test('early sticker downloads persist across sessions, deduplicate and repair modified artwork', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), '16c-sticker-cache-'))
  let downloads = 0
  const download = async () => {
    downloads++
    return new Response(png)
  }
  try {
    const first = await harness(root, download)
    await Promise.all([first(key, 'https://region.example'), first(key, 'https://region.example')])
    assert.equal(downloads, 1)
    const laterMatch = await harness(root, download)
    assert.deepEqual(Buffer.from(await laterMatch(key, 'https://region.example')), png)
    assert.equal(downloads, 1)
    await fs.writeFile(path.join(root, 'sticker-images', `${hash}.png`), 'damaged')
    await laterMatch(key, 'https://region.example')
    assert.equal(downloads, 2)
    assert.throws(() => laterMatch('../image.png', 'https://region.example'))
    const bad = await harness(root, async () => new Response('wrong hash'))
    const other = `media/16competitive/stickers/${'a'.repeat(64)}/image.png`
    await assert.rejects(bad(other, 'https://region.example'), /hash or image/)
    await assert.rejects(fs.stat(path.join(root, 'sticker-images', `${'a'.repeat(64)}.png`)), {
      code: 'ENOENT'
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
