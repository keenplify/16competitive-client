/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import {
  presentationModelPath,
  sourcePlayerModelPath
} from '../src/renderer/src/features/party/party-models.ts'
import {
  characterAnimationLabels,
  lobbyAnimationIndexFor,
  resolveAnimationIndex,
  lobbySequenceLabelFor
} from '../src/renderer/src/features/party/character-animation.ts'

const context = vm.createContext({ Map, Set })
const source = ts.transpileModule(
  await readFile(
    new URL('../src/renderer/src/features/party/lobby-animation-source.ts', import.meta.url),
    'utf8'
  ),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
).outputText
const module = new vm.SourceTextModule(source, { context })
await module.link(
  () =>
    new vm.SyntheticModule(
      ['lobbySequenceLabelFor'],
      function () {
        this.setExport('lobbySequenceLabelFor', lobbySequenceLabelFor)
      },
      { context }
    )
)
await module.evaluate()
const { lobbyAnimationSource } = module.namespace

test('presentation aliases resolve back to the selected local character', () => {
  for (const name of ['arctic', 'gign', 'gsg9', 'guerilla', 'leet', 'sas', 'terror', 'urban']) {
    const path = `player/${name}/${name}.mdl`
    assert.equal(sourcePlayerModelPath(presentationModelPath(path)), path)
  }
  assert.equal(
    sourcePlayerModelPath('models/16competitive/player_ct/custom/p.mdl'),
    'models/16competitive/player_ct/custom/p.mdl'
  )
})

const model = (...labels) => ({ sequences: labels.map((label) => ({ label })) })
test('party and character previews prefer the matching lobby idle over stock aiming', () => {
  assert.equal(lobbyAnimationIndexFor(model('death', 'ref_aim_ak47', 'idle_rifle'), 'ak47'), 2)
  assert.equal(
    resolveAnimationIndex(
      model('death', 'ref_aim_rifle', 'IDLE_RIFLE'),
      characterAnimationLabels('m4a1')
    ),
    2
  )
})
test('stock models fall back to the appropriate weapon pose', () => {
  for (const [weapon, pose] of [
    ['ak47', 'ak47'],
    ['m4a1', 'rifle'],
    ['elite', 'dualpistols'],
    ['mp5navy', 'mp5'],
    ['hegrenade', 'grenade']
  ]) {
    assert.equal(lobbyAnimationIndexFor(model('death', 'idle1', `ref_aim_${pose}`), weapon), 2)
  }
})
test('custom models without lobby or aiming animations choose idle before first sequence', () => {
  assert.equal(lobbyAnimationIndexFor(model('death', 'idle', 'idle1'), 'ak47'), 2)
  assert.equal(lobbyAnimationIndexFor(model('death', 'IDLE'), 'ak47'), 1)
  assert.equal(lobbyAnimationIndexFor(model('custom_pose'), 'ak47'), 0)
})

test('unrecognized labels fall back to the GoldSrc idle activity', () => {
  assert.equal(
    lobbyAnimationIndexFor(
      {
        sequences: [
          { label: 'death', activity: 20 },
          { label: 'custom_rest', activity: 1 }
        ]
      },
      'ak47'
    ),
    1
  )
})

const rig = (bones, labels = ['idle_rifle']) => ({
  bones: bones.map(([name, parent]) => ({ name, parent })),
  ...model(...labels)
})
test('lobby animation matches reordered bones and keeps the selected model untouched', () => {
  const player = rig(
    [
      ['root', -1],
      ['right', 0],
      ['left', 0]
    ],
    ['idle1']
  )
  const donor = rig(
    [
      ['ROOT', -1],
      ['LEFT', 0],
      ['RIGHT', 0]
    ],
    ['idle_smg', 'idle_rifle']
  )
  const before = structuredClone(player)
  const selection = lobbyAnimationSource(player, donor, 'ak47')
  assert.equal(selection.sequenceIndex, 1)
  assert.deepEqual(Array.from(selection.boneIndices), [0, 2, 1])
  assert.deepEqual(player, before)
})
test('incompatible skeletons and missing weapon animations fall back to the model own pose', () => {
  const player = rig([
    ['root', -1],
    ['hand', 0]
  ])
  for (const donor of [
    rig([
      ['root', -1],
      ['other', 0]
    ]),
    rig([
      ['root', -1],
      ['hand', -1]
    ]),
    rig(
      [
        ['root', -1],
        ['hand', 0]
      ],
      ['idle_pistol']
    ),
    rig([
      ['root', -1],
      ['hand', 0],
      ['HAND', 0]
    ])
  ])
    assert.equal(lobbyAnimationSource(player, donor, 'ak47'), null)
  assert.equal(lobbyAnimationSource(rig([]), player, 'ak47'), null)
})
test('all eight bundled characters provide each supported weapon idle', async () => {
  for (const name of ['arctic', 'gign', 'gsg9', 'guerilla', 'leet', 'sas', 'terror', 'urban']) {
    const bytes = await readFile(
      new URL(`../resources/lobby-models/${name}_lobby.mdl`, import.meta.url)
    )
    const nameAt = (offset) =>
      bytes
        .subarray(offset, offset + 32)
        .toString()
        .split('\0')[0]
    const bones = Array.from({ length: bytes.readInt32LE(140) }, (_, i) => {
      const offset = bytes.readInt32LE(144) + i * 112
      return { name: nameAt(offset), parent: bytes.readInt32LE(offset + 32) }
    })
    const sequences = Array.from({ length: bytes.readInt32LE(164) }, (_, i) => ({
      label: nameAt(bytes.readInt32LE(168) + i * 176)
    }))
    const donor = { bones, sequences }
    for (const weapon of ['ak47', 'usp', 'awp', 'mp5navy', 'knife']) {
      assert.ok(
        lobbyAnimationSource({ bones, sequences: [{ label: 'idle1' }] }, donor, weapon),
        `${name}: ${weapon}`
      )
    }
    assert.equal(lobbyAnimationSource(donor, donor, 'hegrenade'), null)
  }
})
