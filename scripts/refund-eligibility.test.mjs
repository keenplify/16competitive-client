import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundled = await build({
  entryPoints: ['src/renderer/src/features/skins/refund-eligibility.store.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  plugins: [
    {
      name: 'auth',
      setup(b) {
        b.onResolve({ filter: /auth.store$/ }, () => ({ path: 'auth', namespace: 'stub' }))
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export const useAuthStore={subscribe(fn){globalThis.changeAccount=fn}}'
        }))
      }
    }
  ]
})
const { useRefundEligibilityStore: store, refundFailure } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
)
test('eligibility comes from quotes, preserves reasons and bounds requests', async () => {
  let active = 0,
    maximum = 0
  globalThis.window = {
    api: {
      skins: {
        resaleQuote: async (id) => {
          active++
          maximum = Math.max(maximum, active)
          await new Promise((r) => setTimeout(r, 2))
          active--
          if (id === 'gift') throw { code: 'SKIN_NOT_PURCHASED' }
          if (id === 'low') throw Error('SKIN_NOT_RESELLABLE')
          if (id === 'offline') throw Error('offline')
          return { payout: 65 }
        }
      }
    }
  }
  const items = ['gift', 'low', 'offline', 'paid', 'a', 'b'].map((id) => ({
    skin: { id, status: 'PUBLISHED' },
    acquiredAt: 'now'
  }))
  await store.getState().load(items)
  assert.equal(store.getState().entries['gift:now'], 'notPurchased')
  assert.equal(store.getState().entries['low:now'], 'notResellable')
  assert.equal(store.getState().entries['offline:now'], 'unavailable')
  assert.equal(store.getState().entries['paid:now'], 'eligible')
  assert.ok(maximum <= 4)
  assert.equal(refundFailure(Error('Error invoking remote method: SKIN_NOT_OWNED')), 'notOwned')
  globalThis.changeAccount(
    { session: { player: { id: 'b' } } },
    { session: { player: { id: 'a' } } }
  )
  assert.deepEqual(store.getState().entries, {})
})
