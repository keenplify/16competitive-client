/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { skinPreviewRevision } from '../src/shared/skins.ts'

async function loadModule(path, globals = {}, mocks = {}) {
  const context = vm.createContext({ Buffer, ArrayBuffer, Uint8Array, console, ...globals })
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }).outputText
  const module = new vm.SourceTextModule(code, { context })
  await module.link(async (name) => {
    const exports = mocks[name] ?? (await import(name))
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return module.namespace
}

const modelBytes = (value) => {
  const bytes = Buffer.alloc(16, value)
  bytes.write('IDST')
  return Uint8Array.from(bytes).buffer
}

test('disk previews discard old models when the catalog model path changes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), '16c-preview-cache-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cache = await loadModule(
    '../src/main/skin-preview-cache.ts',
    {},
    {
      electron: { app: { getPath: () => root } }
    }
  )
  const oldModel = modelBytes(1)
  const newModel = modelBytes(2)
  const before = skinPreviewRevision({ playerModelPath: 'models/16competitive/ak47/old/p.mdl' })
  const after = skinPreviewRevision({ playerModelPath: 'models/16competitive/ak47/new/p.mdl' })
  await cache.writeCachedSkinPreview('skin', oldModel, before)
  assert.deepEqual(await cache.readCachedSkinPreview('skin', before), oldModel)
  assert.equal(await cache.readCachedSkinPreview('skin', after), null)
  await cache.writeCachedSkinPreview('skin', newModel, after)
  assert.deepEqual(await cache.readCachedSkinPreview('skin', after), newModel)
})

test('legacy previews without a model revision are refetched and repair clears previews', async (t) => {
  const root = await mkdtemp(join(tmpdir(), '16c-preview-cache-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cache = await loadModule(
    '../src/main/skin-preview-cache.ts',
    {},
    {
      electron: { app: { getPath: () => root } }
    }
  )
  await cache.writeCachedSkinPreview('skin', modelBytes(1))
  assert.equal(await cache.readCachedSkinPreview('skin', 'new/p.mdl'), null)
  await cache.writeCachedSkinPreview('skin', modelBytes(2), 'new/p.mdl')
  await cache.clearCachedSkinPreviews()
  assert.equal(await cache.readCachedSkinPreview('skin', 'new/p.mdl'), null)
})

test('model revisions bypass old thumbnails and repair removes persisted thumbnails', async (t) => {
  const root = await mkdtemp(join(tmpdir(), '16c-thumbnail-cache-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cache = await loadModule(
    '../src/main/model-thumbnail-cache.ts',
    {},
    {
      electron: { app: { getPath: () => root } }
    }
  )
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer
  await cache.writeModelThumbnail('skin:old/p.mdl:presentation', png)
  assert.deepEqual(await cache.readModelThumbnail('skin:old/p.mdl:presentation'), png)
  assert.equal(await cache.readModelThumbnail('skin:new/p.mdl:presentation'), null)
  await cache.clearCachedModelThumbnails()
  assert.equal(await cache.readModelThumbnail('skin:old/p.mdl:presentation'), null)
})

test('memory cache deduplicates the same model but reloads a changed model for the same skin', async () => {
  const requests = []
  const cache = await loadModule('../src/renderer/src/features/skins/skin-model-cache.ts', {
    window: {
      api: {
        skins: {
          previewModel: async (id) => {
            requests.push(id)
            return modelBytes(requests.length)
          }
        }
      }
    }
  })
  const oldModel = await cache.getCachedSkinModel('skin', 'old/p.mdl')
  assert.equal(await cache.getCachedSkinModel('skin', 'old/p.mdl'), oldModel)
  const newModel = await cache.getCachedSkinModel('skin', 'new/p.mdl')
  assert.notDeepEqual(newModel, oldModel)
  assert.equal(await cache.getCachedSkinModel('skin', 'new/p.mdl'), newModel)
  assert.deepEqual(requests, ['skin', 'skin'])
})

test('a preview request started before repair cannot repopulate the memory cache', async () => {
  const pending = []
  const cache = await loadModule('../src/renderer/src/features/skins/skin-model-cache.ts', {
    window: {
      api: { skins: { previewModel: () => new Promise((resolve) => pending.push(resolve)) } }
    }
  })
  const oldRequest = cache.getCachedSkinModel('skin', 'p.mdl')
  assert.equal(cache.getCachedSkinModel('skin', 'p.mdl'), oldRequest)
  cache.clearCachedSkinModels()
  const newRequest = cache.getCachedSkinModel('skin', 'p.mdl')
  pending[0](modelBytes(1))
  await oldRequest
  assert.equal(cache.getCachedSkinModel('skin', 'p.mdl'), newRequest)
  const newModel = modelBytes(2)
  pending[1](newModel)
  await newRequest
  assert.equal(await cache.getCachedSkinModel('skin', 'p.mdl'), newModel)
  assert.equal(pending.length, 2)
})
