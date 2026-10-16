/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

const sources = await Promise.all(
  ['partner-branding/partner-branding.store', 'auth/icafe-branch.store'].map(
    async (path) =>
      ts.transpileModule(
        await readFile(new URL(`../src/renderer/src/features/${path}.ts`, import.meta.url), 'utf8'),
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
      ).outputText
  )
)
const unlinked = { info: null, hasConfig: false, managedExternally: false }
const linked = {
  info: { branchName: 'Partner branch', xpMultiplier: 1.2 },
  hasConfig: true,
  managedExternally: false
}
async function harness({ storage = new Map(), unlinkError, status = unlinked, statusError } = {}) {
  const context = vm.createContext({
    Error,
    window: {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value)
      },
      api: {
        auth: {
          unlinkIcafeBranch: async () => {
            if (unlinkError) throw new Error(unlinkError)
            return unlinked
          },
          getIcafeBranchInfo: async () => {
            if (statusError) throw new Error('IPC unavailable')
            return status
          }
        },
        partnerBranding: { get: async () => ({ branding: { partnerId: 'community' } }) }
      }
    }
  })
  const zustand = new vm.SyntheticModule(
    ['create'],
    function () {
      this.setExport('create', create)
    },
    { context }
  )
  const branding = new vm.SourceTextModule(sources[0], { context })
  await branding.link(() => zustand)
  await branding.evaluate()
  const branch = new vm.SourceTextModule(sources[1], { context })
  await branch.link((name) => (name === 'zustand' ? zustand : branding))
  await branch.evaluate()
  return {
    theme: branding.namespace.usePartnerBrandingStore,
    branch: branch.namespace.useIcafeBranchStore,
    storage
  }
}

test('unlink restores the standard theme immediately and after restart despite community branding', async () => {
  const h = await harness()
  await h.theme.getState().refresh('account')
  assert.equal(h.theme.getState().enabled, true)
  assert.ok(h.theme.getState().branding)
  await h.branch.getState().unlink()
  assert.equal(h.branch.getState().status.hasConfig, false)
  assert.equal(h.branch.getState().error, null)
  assert.equal(h.branch.getState().busy, false)
  assert.equal(h.theme.getState().enabled, false)
  await h.theme.getState().refresh('account')
  assert.equal(h.theme.getState().enabled, false)
  const restarted = await harness({ storage: h.storage })
  await restarted.theme.getState().refresh('account')
  assert.equal(restarted.theme.getState().enabled, false)
  // The player can still explicitly opt back into their community theme.
  restarted.theme.getState().setEnabled(true)
  assert.equal(restarted.theme.getState().enabled, true)
})

test('local unlink still resets the theme when backend deactivation fails', async () => {
  const h = await harness({ unlinkError: 'ICAFE_UNLINK_UNAVAILABLE' })
  await h.branch.getState().unlink()
  assert.equal(h.theme.getState().enabled, false)
  assert.equal(h.branch.getState().error, 'ICAFE_UNLINK_UNAVAILABLE')
})

for (const status of [linked, { ...linked, managedExternally: true }]) {
  test(`failed unlink preserves the theme when a branch remains (external=${status.managedExternally})`, async () => {
    const h = await harness({ unlinkError: 'ICAFE_UNLINK_UNAVAILABLE', status })
    await h.branch.getState().unlink()
    assert.equal(h.theme.getState().enabled, true)
  })
}

test('unknown branch status after an unlink failure does not reset the saved theme', async () => {
  const h = await harness({ unlinkError: 'ICAFE_UNLINK_UNAVAILABLE', statusError: true })
  await h.branch.getState().unlink()
  assert.equal(h.theme.getState().enabled, true)
  assert.equal(h.branch.getState().error, 'ICAFE_UNLINK_UNAVAILABLE')
})
