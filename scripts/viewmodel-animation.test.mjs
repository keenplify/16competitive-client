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

const geometry = await load('../src/renderer/src/libs/web-hlmv/lib/geometryTransformer.ts', {
  '../const/constants': { ANIM_VALUE: { VALUE: 0, VALID: 1, TOTAL: 2 }, MOTION_X: 1, MOTION_Z: 4 }
})
const bone = { value: [10, 20, 30, 0, 0, 0], scale: [0.5, 1, 2, 1, 1, 1] }

test('viewmodel Draw positions decode each run and hold its final valid sample', () => {
  const runs = [
    [0, 2, 4],
    [4, 0, 0],
    [8, 0, 0],
    [0, 1, 2],
    [12, 0, 0]
  ]
  const values = {
    get: (sequence, boneIndex, axis, index, field) => {
      assert.equal(sequence, 0)
      assert.equal(boneIndex, 0)
      assert.equal(axis, 0)
      return runs[index]?.[field] ?? 0
    }
  }
  for (const [frame, x] of [
    [0, 12],
    [1, 14],
    [2, 14],
    [3, 14],
    [4, 16],
    [5, 16]
  ]) {
    assert.deepEqual(
      Array.from(geometry.getBonePositions(frame, bone, [12, 0, 0], values, 0, 0, 0)),
      [x, 20, 30]
    )
  }
})
test('missing or malformed translation runs preserve the bone default without hanging', () => {
  const empty = { get: () => 0 }
  assert.deepEqual(
    Array.from(geometry.getBonePositions(30, bone, [1, 1, 1], empty, 0, 0, 0)),
    [10, 20, 30]
  )
})
test('rotation channels remain separate from viewmodel translation channels', () => {
  const axes = []
  const values = {
    get: (_sequence, _boneIndex, axis, index, field) => {
      axes.push(axis)
      return index === 0 ? [0, 1, 32][field] : 0
    }
  }
  const q = geometry.calcBoneQuaternion(0, bone, [1, 1, 1, 1, 0, 0], values, 0, 0, 0)
  assert.deepEqual(Array.from(q), [0, 0, 0, 1])
  assert.ok(axes.every((axis) => axis === 3))
})
