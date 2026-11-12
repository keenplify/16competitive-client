/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundled = await build({
  entryPoints: ['src/web/diagnostic-reports.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false
})
const { createWebDiagnosticReports } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
)
function fixture() {
  const calls = []
  let owner = 'account-a'
  const deps = {
    session: () => owner,
    post: async (body) => {
      calls.push(['report', body])
      return { id: 'report', createdAt: 'now' }
    },
    logs: async () => 'helper logs',
    prepare: async () => ({ id: 'preview', files: [], totalBytes: 0 }),
    upload: async (...args) => {
      calls.push(['upload', ...args])
    }
  }
  return {
    deps,
    calls,
    switchOwner: () => {
      owner = 'account-b'
    }
  }
}
test('web exposes file preview and uploads only the consented snapshot after creating its report', async () => {
  const { deps, calls } = fixture()
  const api = createWebDiagnosticReports(deps)
  assert.equal((await api.compatibility('cs16')).id, 'preview')
  assert.equal(calls.length, 0)
  await api.report('issue', [], undefined, [], 'preview')
  assert.equal(calls[0][0], 'report')
  assert.equal(calls[0][1].deduplicationKey, 'compatibility:preview')
  assert.deepEqual(calls[1], ['upload', 'report', 'preview'])
})
test('declining files submits logs only; failed uploads do not report success', async () => {
  const { deps, calls } = fixture()
  const api = createWebDiagnosticReports(deps)
  await api.report('issue', [])
  assert.equal(calls.length, 1)
  deps.upload = async () => {
    throw new Error('COMPATIBILITY_UPLOAD_FAILED')
  }
  await assert.rejects(
    api.report('issue', [], undefined, [], 'preview'),
    /COMPATIBILITY_UPLOAD_FAILED/
  )
})
test('account changes prevent attaching another session snapshot', async () => {
  const { deps, calls, switchOwner } = fixture()
  deps.logs = async () => {
    switchOwner()
    return 'logs'
  }
  await assert.rejects(
    createWebDiagnosticReports(deps).report('issue', [], undefined, [], 'preview'),
    /ACCOUNT_CHANGED/
  )
  assert.equal(calls.length, 0)
})
