/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import * as THREE from 'three'

async function load(path, mocks = {}) {
  const context = vm.createContext({ Uint8Array, Uint8ClampedArray, console })
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

const { loadPlayerPreview } = await load(
  '../src/renderer/src/features/party/preview-model-fallback.ts'
)
test('valid selected previews retain their model; missing or unusable models use the bundled one', async () => {
  const selected = new ArrayBuffer(1),
    bundled = new ArrayBuffer(2)
  let bundledReads = 0
  const fallback = async () => {
    bundledReads++
    return bundled
  }
  assert.equal(
    await loadPlayerPreview(
      async () => selected,
      fallback,
      (b) => b
    ),
    selected
  )
  assert.equal(bundledReads, 0)
  assert.equal(
    await loadPlayerPreview(
      async () => {
        throw Error('missing')
      },
      fallback,
      (b) => b
    ),
    bundled
  )
  assert.equal(
    await loadPlayerPreview(
      async () => selected,
      fallback,
      (b) => {
        if (b === selected) throw Error('no embedded textures')
        return b
      }
    ),
    bundled
  )
  assert.equal(bundledReads, 2)
})
test('an unavailable bundled model fails once rather than retrying or overwriting files', async () => {
  let reads = 0
  await assert.rejects(
    loadPlayerPreview(
      async () => {
        throw Error('missing selected')
      },
      async () => {
        reads++
        throw Error('missing bundle')
      },
      (b) => b
    ),
    /missing bundle/
  )
  assert.equal(reads, 1)
})

const { createTexture } = await load('../src/renderer/src/libs/web-hlmv/lib/modelRenderer.ts', {
  './three': { default: THREE },
  './geometryBuilder': { readFacesData: () => {} },
  './geometryTransformer': { calcRotations: () => {} },
  '../const/constants': { NF_ADDITIVE: 32 }
})
test('RGBA upload works without DOM ImageData and preserves orientation, colors, alpha and source bytes', () => {
  const source = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 0, 255
  ])
  const before = source.slice()
  const texture = createTexture(source, 2, 2)
  assert.equal(texture.isDataTexture, true)
  assert.equal(texture.flipY, false)
  assert.equal(texture.generateMipmaps, false)
  assert.equal(texture.minFilter, THREE.LinearFilter)
  assert.equal(texture.unpackAlignment, 1)
  assert.deepEqual(
    [...texture.image.data],
    [0, 0, 255, 0, 255, 255, 0, 255, 255, 0, 0, 255, 0, 255, 0, 128]
  )
  assert.deepEqual(source, before)
  texture.dispose()
})
test('invalid dimensions and truncated RGBA buffers cannot become white placeholder textures', () => {
  for (const [w, h] of [
    [0, 1],
    [1, 0],
    [1.5, 1],
    [4097, 1],
    [2, 2]
  ])
    assert.throws(() => createTexture(new Uint8ClampedArray(4), w, h), /Invalid preview/)
})
