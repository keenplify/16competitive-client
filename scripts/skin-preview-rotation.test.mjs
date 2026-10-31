/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { isSkinPreviewRotation, skinPreviewRotation } from '../src/shared/skin-preview-rotation.ts'

const context = vm.createContext({ console })
const modules = new Map()
async function load(url) {
  if (modules.has(url.href)) return modules.get(url.href)
  const source = ts.transpileModule(await readFile(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const mod = new vm.SourceTextModule(source, { context })
  modules.set(url.href, mod)
  await mod.link((path) => load(new URL(path.endsWith('.ts') ? path : path + '.ts', url)))
  await mod.evaluate()
  return mod
}
const presentation = (
  await load(
    new URL('../src/renderer/src/features/skins/skin-model-presentation.ts', import.meta.url)
  )
).namespace
const skins = (await load(new URL('../src/shared/skins.ts', import.meta.url))).namespace

test('per-skin offsets add to weapon defaults without changing other skins', () => {
  assert.deepEqual(
    Array.from(presentation.getSkinPresentationRotation('hegrenade', [0, 0, 180])),
    [15, 0, 180]
  )
  assert.deepEqual(Array.from(presentation.getSkinPresentationRotation('hegrenade')), [15, 0, 0])
  assert.deepEqual(
    Array.from(presentation.getSkinPresentationRotation('player_ct', [0, 0, -90])),
    [0, 0, -90]
  )
  assert.deepEqual(
    Array.from(presentation.getSkinPresentationRotation('ak47', [5, -10, 0])),
    [95, -10, 190]
  )
})
test('rotation-only edits invalidate thumbnails and large previews', () => {
  const skin = { playerModelPath: 'models/16competitive/hegrenade/hash/p.mdl' }
  assert.notEqual(
    skins.skinPreviewRevision(skin),
    skins.skinPreviewRevision({ ...skin, previewRotation: [0, 0, 180] })
  )
  assert.equal(
    skins.skinPreviewRevision(skin),
    skins.skinPreviewRevision({ ...skin, previewRotation: [0, 0, 0] })
  )
  assert.notEqual(
    presentation.getSkinPresentationRevision('knife'),
    presentation.getSkinPresentationRevision('knife', [0, 0, 90])
  )
})
test('invalid untrusted metadata never produces non-finite WebGL rotations', () => {
  for (const value of [
    null,
    [],
    [0, 0],
    [0, 0, 0, 0],
    [NaN, 0, 0],
    [Infinity, 0, 0],
    ['180', 0, 0],
    [361, 0, 0]
  ]) {
    assert.equal(isSkinPreviewRotation(value), false)
    assert.deepEqual(skinPreviewRotation(value), [0, 0, 0])
    assert.deepEqual(
      Array.from(presentation.getSkinPresentationRotation('hegrenade', value)),
      [15, 0, 0]
    )
  }
})

test('HE thumbnails use closer framing and a different cache revision while other grenades keep their framing', () => {
  assert.equal(presentation.getSkinCameraDistanceMultiplier('hegrenade', 0.5), 1)
  assert.equal(presentation.getSkinCameraDistanceMultiplier('flashbang', 0.5), 1.25)
  assert.match(presentation.getSkinPresentationRevision('hegrenade'), /:z2:/)
})
