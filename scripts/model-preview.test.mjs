/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import * as THREE from 'three'
import * as previewHelpers from '../src/renderer/src/libs/web-hlmv/lib/preview-hand-helpers.ts'

async function load(path, mocks = {}, globals = {}) {
  const context = vm.createContext({
    Uint8Array,
    Uint8ClampedArray,
    console,
    performance,
    ...globals
  })
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    }
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

const { createTexture, applyBoneTransforms, applyBoneNormals, createModelMaterial } = await load(
  '../src/renderer/src/libs/web-hlmv/lib/modelRenderer.ts',
  {
    './three': { default: THREE },
    './preview-hand-helpers': previewHelpers,
    './geometryBuilder': { readFacesData: () => {} },
    './geometryTransformer': { calcRotations: () => {} },
    '../const/constants': { NF_ADDITIVE: 32, NF_CHROME: 2 }
  }
)
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

test('bone validation preserves valid translation and leaves malformed or missing bones in bind pose', () => {
  const valid = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1])
  const invalid = valid.slice()
  invalid[0] = NaN
  const vertices = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
  const before = vertices.slice()
  const result = applyBoneTransforms(
    vertices,
    new Int16Array([0, 1, 2]),
    new Uint8Array([0, 1, 2]),
    [valid, invalid]
  )
  assert.deepEqual([...result], [11, 22, 33, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(vertices, before)
})

let decodedFrames = 0
const { prepareRenderData } = await load('../src/renderer/src/libs/web-hlmv/lib/modelRenderer.ts', {
  './three': { default: THREE },
  './preview-hand-helpers': previewHelpers,
  './geometryBuilder': {
    readFacesData: () => ({
      vertices: new Float32Array([1, 2, 3]),
      uv: new Float32Array([0, 0]),
      indices: new Int16Array([0])
    })
  },
  './geometryTransformer': {
    calcRotations: (_model, sequence, frame) => {
      decodedFrames++
      return [
        new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sequence * 10 + frame, 0, 0, 1])
      ]
    }
  },
  '../const/constants': { NF_ADDITIVE: 32, NF_CHROME: 2 }
})
test('interactive Draw, Idle and Slash frames coexist in one prepared dataset', () => {
  const model = {
    sequences: [{ numFrames: 2 }, { numFrames: 3 }, { numFrames: 2 }, { numFrames: 1000 }],
    meshes: [[[{ skinRef: 0 }]]],
    bodyParts: [{ name: 'weapon' }],
    subModels: [[{ name: 'weapon' }]],
    triangles: [[[[]]]],
    vertices: [[[]]],
    skinRef: [0],
    textures: [{ width: 1, height: 1 }],
    vertBoneBuffer: [[new Uint8Array([0])]]
  }
  const data = prepareRenderData(model, [2, 0, 1])[0][0][0]
  assert.equal(decodedFrames, 7)
  assert.deepEqual([...data.geometryBuffers[2][1].array], [22, 2, 3])
  assert.deepEqual([...data.geometryBuffers[1][2].array], [13, 2, 3])
  assert.deepEqual([...data.geometryBuffers[0][1].array], [2, 2, 3])
  assert.equal(data.geometryBuffers[3].length, 1)
})

function boxFaces(includeBody = true) {
  const points = [
    [0, 0, 0],
    [3, 0, 0],
    [3, 1, 0],
    [0, 1, 0],
    [0, 0, 3],
    [3, 0, 3],
    [3, 1, 3],
    [0, 1, 3],
    [6, 0, 0],
    [7, 0, 0],
    [6, 1, 0]
  ]
  const triangles = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [3, 7, 6],
    [3, 6, 2],
    [0, 4, 7],
    [0, 7, 3],
    [1, 2, 6],
    [1, 6, 5]
  ]
  if (includeBody) triangles.push([8, 9, 10])
  const indices = new Int16Array(triangles.flat())
  return {
    vertices: new Float32Array([...indices].flatMap((index) => points[index])),
    uv: new Float32Array([...indices].flatMap((index) => [index / 16, 0.5])),
    indices
  }
}
const helperBones = [{ name: 'Bip01 R Hand' }, { name: 'Cylinder01' }]
const helperBindings = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1])
test('standalone hand helper removal preserves the lit weapon faces sharing its texture', () => {
  const faces = boxFaces(),
    original = faces.vertices.slice()
  const filtered = previewHelpers.filterPreviewHandHelpers(faces, helperBindings, helperBones)
  assert.deepEqual([...filtered.indices], [8, 9, 10])
  assert.deepEqual([...filtered.uv], [...faces.uv.slice(-6)])
  assert.deepEqual([...filtered.vertices], [...faces.vertices.slice(-9)])
  assert.deepEqual(faces.vertices, original)
})
test('a genuine cube-shaped held weapon and non-hand geometry are never hidden', () => {
  const onlyBox = boxFaces(false)
  assert.equal(
    previewHelpers.filterPreviewHandHelpers(onlyBox, helperBindings, helperBones),
    onlyBox
  )
  const weapon = boxFaces()
  assert.equal(
    previewHelpers.filterPreviewHandHelpers(weapon, new Uint8Array(11).fill(1), helperBones),
    weapon
  )
})
test('open or irregular hand geometry remains visible', () => {
  const open = boxFaces()
  open.indices[0] = 1
  assert.equal(previewHelpers.filterPreviewHandHelpers(open, helperBindings, helperBones), open)
  const irregular = boxFaces()
  for (let i = 0; i < irregular.indices.length; i++)
    if (irregular.indices[i] === 6) irregular.vertices[i * 3] = 1.5
  assert.equal(
    previewHelpers.filterPreviewHandHelpers(irregular, helperBindings, helperBones),
    irregular
  )
})

test('chrome textures derive UVs from view-space normals; ordinary and additive materials keep their UVs', () => {
  const source = '#include <uv_vertex>'
  const chrome = createModelMaterial(undefined, 7)
  const shader = { vertexShader: source }
  chrome.onBeforeCompile(shader)
  assert.match(shader.vertexShader, /normalMatrix \* normal/)
  assert.match(shader.vertexShader, /vUv = vec2/)
  assert.equal(chrome.blending, THREE.NormalBlending)
  const ordinaryShader = { vertexShader: source }
  createModelMaterial(undefined, 0).onBeforeCompile(ordinaryShader)
  assert.equal(ordinaryShader.vertexShader, source)
  const additive = createModelMaterial(undefined, 32)
  assert.equal(additive.blending, THREE.AdditiveBlending)
  assert.equal(additive.depthWrite, false)
})
test('chrome normals follow bone rotation without inheriting bone translation', () => {
  const transform = new Float32Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 100, 200, 300, 1])
  const result = applyBoneNormals(
    new Float32Array([1, 0, 0]),
    new Int16Array([0]),
    new Uint8Array([0]),
    [transform]
  )
  assert.deepEqual([...result], [0, 1, 0])
  const fallback = applyBoneNormals(
    new Float32Array([0, 0, 0]),
    new Int16Array([0]),
    new Uint8Array([0]),
    []
  )
  assert.deepEqual([...fallback], [0, 0, 1])
})
const { readFacesData } = await load('../src/renderer/src/libs/web-hlmv/lib/geometryBuilder.ts', {
  '../const/constants': { TRIANGLE_FAN: 0, TRIANGLE_STRIP: 1 }
})
test('chrome preserves the authored normal indices independently of vertex indices in fans and strips', () => {
  const normals = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
  for (const head of [4, -4]) {
    const triangles = new Int16Array([head, 0, 2, 0, 0, 1, 0, 0, 0, 2, 1, 0, 0, 0, 2, 0, 0, 0])
    const decoded = readFacesData(triangles, normals, { width: 64, height: 64 }, 1)
    assert.equal(decoded.indices.length, 6)
    for (let i = 0; i < decoded.indices.length; i++)
      assert.deepEqual(
        [...decoded.vertices.slice(i * 3, i * 3 + 3)],
        [...normals.slice(decoded.indices[i] * 3, decoded.indices[i] * 3 + 3)]
      )
    assert.deepEqual([...decoded.indices.slice(0, 3)], [2, 0, 1])
  }
})

// Exercise the actual lobby mesh/actor builders without mounting React or opening a GPU context.
const partySource = await readFile(
  new URL('../src/renderer/src/features/party/PartyModelScene.tsx', import.meta.url),
  'utf8'
)
const lobbyContext = vm.createContext({
  THREE,
  createModelMaterial,
  createTexture,
  applyBoneNormals,
  applyBoneTransforms,
  readFacesData,
  NF_CHROME: 2,
  performance,
  randomAnimationPhase: () => 0,
  weaponKeyFromPath: () => 'm4a1',
  weaponTransformsFor: () => [
    {
      modelRotation: [0, 0, 90],
      handRotation: [0, 0, 90],
      handOffset: [11, 0, 2]
    }
  ],
  parseModelCached: (value) => value,
  buildTexture: () => new Uint8ClampedArray([255, 255, 255, 255])
})
const lobbyBuilders = [
  partySource.slice(partySource.indexOf('const addMesh ='), partySource.indexOf('// Exposed for')),
  partySource.slice(
    partySource.indexOf('const setActorOpacity ='),
    partySource.indexOf('const randomAnimationPhase =')
  ),
  partySource.slice(
    partySource.indexOf('const createActor ='),
    partySource.indexOf('interface PartyModelSceneProps')
  )
].join(String.fromCharCode(10))
vm.runInContext(
  ts.transpileModule(lobbyBuilders, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText,
  lobbyContext
)
const lobby = vm.runInContext('({ addMesh, setActorOpacity, createActor })', lobbyContext)

test('held chrome weapons retain authored normals through model, bone and hand rotations', () => {
  const identity = new THREE.Matrix4().toArray()
  const translated = new THREE.Matrix4().makeTranslation(100, 200, 300).toArray()
  const player = {
    meshes: [],
    textures: [],
    boneNames: ['r hand'],
    boneTransforms: [[identity], [translated]],
    fps: 10,
    frameCount: 2,
    upperBodyPivots: []
  }
  const weapon = {
    textures: [{ width: 1, height: 1, flags: 2 }],
    skinRef: [0],
    bones: [{ name: 'r hand' }],
    meshes: [[[{ skinRef: 0 }]]],
    triangles: [[[new Int16Array([3, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0])]]],
    vertices: [[new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])]],
    normals: [[new Float32Array([1, 0, 0])]],
    vertBoneBuffer: [[new Uint8Array([0, 0, 0])]],
    normBoneBuffer: [[new Uint8Array([0])]]
  }
  const actor = lobby.createActor(
    { weaponPath: 'p_m4a1.mdl', weaponKey: 'm4a1' },
    player,
    weapon,
    false
  )
  const mesh = actor.children[0]
  assert.equal(mesh.material.skinning, false)
  const shader = { vertexShader: '#include <uv_vertex>' }
  mesh.material.onBeforeCompile(shader)
  assert.match(shader.vertexShader, /normalMatrix \* normal/)
  const normals = mesh.userData.normalFrames
  assert.equal(normals.length, 2)
  for (const frame of normals) {
    for (let i = 0; i < frame.array.length; i += 3) {
      assert.ok(Math.abs(frame.array[i] + 1) < 1e-6)
      assert.ok(Math.abs(frame.array[i + 1]) < 1e-6)
      assert.ok(Math.abs(frame.array[i + 2]) < 1e-6)
    }
  }
  assert.notEqual(mesh.geometry.getAttribute('normal').array, normals[0].array)
})
test('lobby fade preserves additive blending and its authored preview opacity', () => {
  const group = new THREE.Group()
  const mesh = lobby.addMesh(
    group,
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    new THREE.BufferAttribute(new Float32Array(6), 2),
    new Uint8ClampedArray([255, 255, 255, 255]),
    { width: 1, height: 1, flags: 32 }
  )
  assert.equal(mesh.material.blending, THREE.AdditiveBlending)
  assert.equal(mesh.material.depthWrite, false)
  lobby.setActorOpacity(group, 0.5)
  assert.equal(mesh.material.opacity, 0.4)
  lobby.setActorOpacity(group, 1)
  assert.equal(mesh.material.opacity, 0.8)
  assert.equal(mesh.geometry.getAttribute('normal'), undefined)
})

async function modelViewerHarness(read) {
  const states = [],
    effects = [],
    errors = []
  let index = 0
  const renderer = () => null
  const invalid = new ArrayBuffer(8)
  const { ModelViewer } = await load(
    '../src/renderer/src/libs/web-hlmv/ui/ModelViewer.tsx',
    {
      react: {
        useState: (initial) => {
          const slot = index++
          if (!(slot in states)) states[slot] = initial
          return [
            states[slot],
            (value) => {
              states[slot] = value
            }
          ]
        },
        useEffect: (effect) => {
          effects.push(effect)
        }
      },
      './Renderer': { Renderer: renderer },
      '../lib/modelDataParser': {
        parseModelCached: (buffer) => {
          if (buffer === invalid) throw new Error('Unsupported version of the MDL file')
          return {}
        }
      }
    },
    { AbortController, window: { api: { models: { read } } } }
  )
  let props
  const render = (input) => {
    props = input ?? props
    index = 0
    effects.length = 0
    return ModelViewer({
      ...props,
      onLoadError: (error) => errors.push(error),
      fallback: 'fallback'
    })
  }
  const start = () => effects.map((effect) => effect())
  const flush = () => new Promise((resolve) => setImmediate(resolve))
  const scene = (tree) => tree.props.children.flat().find((child) => child?.type === renderer)
  return { invalid, render, start, flush, scene, errors }
}

test('unsupported primary MDL resolves to preview fallback without entering Renderer', async () => {
  const h = await modelViewerHarness(() => Promise.resolve(h.invalid))
  h.render({ modelPath: 'p_ak47.mdl' })
  h.start()
  await h.flush()
  const tree = h.render()
  assert.equal(h.scene(tree), undefined)
  assert.equal(h.errors.length, 1)
  assert.match(h.errors[0].message, /Unsupported version/)
  assert.ok(tree.props.children.flat().some((child) => child?.props?.children === 'fallback'))
})

test('unsupported companion MDL keeps the valid primary model visible', async () => {
  const valid = new ArrayBuffer(16)
  const h = await modelViewerHarness((path) =>
    Promise.resolve(path === 'weapon.mdl' ? h.invalid : valid)
  )
  h.render({ modelPath: 'player.mdl', attachedModelPath: 'weapon.mdl' })
  h.start()
  await h.flush()
  const scene = h.scene(h.render())
  assert.equal(scene.props.modelBuffer, valid)
  assert.equal(scene.props.attachedModelBuffer, undefined)
  assert.equal(h.errors.length, 0)
})

test('a stale model load cannot replace a newly selected preview or report its failure', async () => {
  let finishOld
  const valid = new ArrayBuffer(16)
  const h = await modelViewerHarness((path) =>
    path === 'old.mdl'
      ? new Promise((resolve) => {
          finishOld = resolve
        })
      : Promise.resolve(valid)
  )
  h.render({ modelPath: 'old.mdl' })
  const cleanups = h.start()
  cleanups.forEach((cleanup) => cleanup?.())
  h.render({ modelPath: 'new.mdl' })
  h.start()
  await h.flush()
  finishOld(h.invalid)
  await h.flush()
  assert.equal(h.scene(h.render()).props.modelBuffer, valid)
  assert.equal(h.errors.length, 0)
})
