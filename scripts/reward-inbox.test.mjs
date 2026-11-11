/* eslint-disable @typescript-eslint/explicit-function-return-type -- JavaScript tooling cannot declare TypeScript return types. */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
const dir = await mkdtemp(join(tmpdir(), '16c-rewards-'))
after(() => rm(dir, { recursive: true, force: true }))
async function bundled(entry, name) {
  const file = join(dir, name + '.mjs')
  await build({
    entryPoints: [entry],
    outfile: file,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent'
  })
  return import(pathToFileURL(file))
}
const { parseRewardInbox, combineRewards, validRewardIds } = await bundled(
  'src/shared/reward-inbox.ts',
  'contract'
)
const { rewardRarity } = await bundled(
  'src/renderer/src/features/rewards/reward-rarity.ts',
  'rarity'
)
const { useRewardInbox: store } = await bundled(
  'src/renderer/src/features/rewards/reward-inbox.store.ts',
  'store'
)
const reward = (n, amount = 150, type = 'POINTS') => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  type,
  itemId: type,
  amount,
  name: null,
  weaponKey: null,
  imagePath: null
})
test('consolidates currency and identical stickers without changing receipts', () => {
  const receipts = [
    reward(1),
    reward(2, 80),
    reward(3, 10, 'P_CASH'),
    { ...reward(4, 1, 'STICKER'), itemId: 'sticker' },
    { ...reward(5, 2, 'STICKER'), itemId: 'sticker' }
  ]
  assert.deepEqual(
    combineRewards(receipts).map((r) => r.amount),
    [230, 10, 3]
  )
  assert.equal(receipts[0].amount, 150)
})
test('rejects unsafe media, malformed receipts and duplicate acknowledgments', () => {
  assert.equal(parseRewardInbox({ rewards: [reward(1)] }).rewards.length, 1)
  for (const fields of [
    { amount: -1 },
    { amount: Infinity },
    { imagePath: 'file:///private' },
    { previewRotation: [NaN, 0, 0] },
    { type: 'TOKEN' },
    { type: 'SKIN', itemId: '../../private' }
  ]) {
    assert.throws(() => parseRewardInbox({ rewards: [{ ...reward(1), ...fields }] }))
  }
  assert.throws(() => parseRewardInbox({ rewards: [reward(1), reward(1)] }))
  assert.equal(validRewardIds([reward(1).id, reward(1).id]), false)
  assert.equal(validRewardIds(['all']), false)
})
test('cash has the high-rarity reveal and items match existing shop tiers', () => {
  assert.equal(rewardRarity(reward(1)), 'FIELD')
  assert.equal(rewardRarity(reward(2, 1, 'P_CASH')), 'RELIC')
  assert.equal(
    rewardRarity({ ...reward(3, 1, 'SKIN'), weaponKey: 'ak47', pricePoints: 10000 }),
    'CRIMSON'
  )
  assert.equal(rewardRarity({ ...reward(4, 1, 'STICKER'), pricePoints: 3500 }), 'VANGUARD')
})
test('a displayed batch stays frozen, failed consumption retries exact IDs, then loads new arrivals', async () => {
  let pending = [reward(1), reward(2, 80)]
  let reject = true
  const calls = []
  globalThis.window = {
    api: {
      rewards: {
        pending: async () => ({ rewards: pending }),
        consume: async (ids) => {
          calls.push(ids)
          if (reject) throw Error('offline')
        }
      }
    }
  }
  store.getState().setOwner('a')
  await store.getState().load()
  pending = [reward(3, 50)]
  await store.getState().load()
  assert.equal(store.getState().receipts.length, 2)
  await assert.rejects(store.getState().consume())
  assert.equal(store.getState().receipts.length, 2)
  reject = false
  await store.getState().consume()
  assert.deepEqual(calls[0], calls[1])
  assert.equal(store.getState().receipts.length, 0)
  await store.getState().load()
  assert.equal(store.getState().receipts[0].amount, 50)
})
test('late load and consume responses cannot cross an account switch', async () => {
  let resolveLoad
  globalThis.window.api.rewards.pending = () =>
    new Promise((resolve) => {
      resolveLoad = resolve
    })
  store.getState().setOwner('a2')
  const loading = store.getState().load()
  store.getState().setOwner('b')
  resolveLoad({ rewards: [reward(4)] })
  await loading
  assert.deepEqual(store.getState().receipts, [])
  globalThis.window.api.rewards.pending = async () => ({ rewards: [reward(5)] })
  await store.getState().load()
  let resolveConsume
  globalThis.window.api.rewards.consume = () =>
    new Promise((resolve) => {
      resolveConsume = resolve
    })
  const consuming = store.getState().consume()
  store.getState().setOwner('c')
  await store.getState().load()
  resolveConsume()
  await consuming
  assert.equal(store.getState().receipts.length, 1)
  assert.equal(store.getState().owner, 'c')
})
test('all rarity cues are distinct bounded original PCM audio with fade-outs', async () => {
  const cues = await Promise.all(
    ['field', 'forge', 'strike', 'vanguard', 'neon', 'crimson', 'relic', 'vault'].map((name) =>
      readFile(`src/renderer/public/audio/sfx/reward-${name}.wav`)
    )
  )
  assert.equal(new Set(cues.map((b) => b.toString('base64'))).size, 8)
  for (const wav of cues) {
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
    const count = (wav.length - 44) / 2
    assert.ok(count / wav.readUInt32LE(24) < 0.8)
    let peak = 0
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)))
    assert.ok(peak > 1000 && peak < 32767)
    assert.ok(Math.abs(wav.readInt16LE(wav.length - 2)) < 20)
  }
})
