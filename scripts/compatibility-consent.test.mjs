/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

async function fixture(matchState = {}, failures = {}) {
  const auth = create(() => ({ session: { player: { id: 'account-a' } } }))
  const saved = new Map(),
    sent = [],
    requestedGames = []
  const labels = JSON.parse(
    await readFile(new URL('../src/shared/issue-report-translations.json', import.meta.url))
  )
  const preview = {
    id: 'preview',
    files: [{ path: 'hw.dll', sha256: 'a'.repeat(64), size: 128 }],
    totalBytes: 128
  }
  const context = vm.createContext({
    console,
    Error,
    localStorage: {
      getItem: (k) => saved.get(k),
      setItem: (k, v) => saved.set(k, v),
      removeItem: (k) => saved.delete(k)
    },
    window: {
      api: {
        gameSettings: { getAssetSyncStatus: async () => null },
        diagnosticLogs: {
          compatibility: async (game) => {
            requestedGames.push(game)
            if (failures.prepare) throw new Error(failures.prepare)
            return preview
          },
          report: async (...args) => {
            sent.push(args)
            if (failures.report && args[4]) throw new Error(failures.report)
          }
        }
      }
    }
  })
  const source = await readFile(
    new URL('../src/renderer/src/features/issue-report/issue-report.store.ts', import.meta.url),
    'utf8'
  )
  const module = new vm.SourceTextModule(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022
      }
    }).outputText,
    { context }
  )
  await module.link((name) => {
    const exports =
      name === 'zustand'
        ? { create }
        : name === 'react-toastify'
          ? {
              toast: {
                loading: () => 1,
                update: () => undefined,
                error: () => undefined,
                dismiss: () => undefined
              }
            }
          : name.endsWith('.json')
            ? { default: labels }
            : name.includes('auth.store')
              ? { useAuthStore: auth }
              : name.includes('navigation.store')
                ? { useNavigationStore: { getState: () => ({}) } }
                : name.includes('custom-games.store')
                  ? { useCustomGamesStore: { getState: () => ({}) } }
                  : name.includes('matchmaking.store')
                    ? { useMatchmakingStore: { getState: () => matchState } }
                    : name.includes('i18n')
                      ? { useLanguageStore: { getState: () => ({ language: 'en' }) } }
                      : { getRendererDiagnosticLogs: () => [] }
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return { store: module.namespace.useIssueReport, auth, saved, sent, requestedGames }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('compatibility preview selects the reported game before sending', async () => {
  for (const [matchState, expected] of [
    [{ selectedMode: 'cs13_3v3' }, 'cs13'],
    [{ selectedMode: 'cs13_1v1' }, 'cs13'],
    [{ selectedMode: '5v5', match: { mode: 'cs13_3v3' } }, 'cs13'],
    [{ selectedMode: '5v5', completedMatch: { mode: 'cs13_1v1' } }, 'cs13'],
    [{ selectedMode: 'cs13_3v3', match: { mode: '5v5' } }, 'cs16'],
    [{ selectedMode: 'legacy' }, 'cs16']
  ]) {
    const { store, requestedGames, sent } = await fixture(matchState)
    store.setState({ open: true, description: 'test' })
    await store.getState().submit()
    await settle()
    assert.deepEqual(requestedGames, [expected])
    assert.equal(sent.length, 0)
  }
})

test('Submit asks before sending; Not now sends logs without remembering refusal', async () => {
  const { store, saved, sent } = await fixture()
  store.setState({ open: true, description: 'test' })
  await settle()
  assert.equal(store.getState().consentOpen, false)
  assert.equal(sent.length, 0)
  await store.getState().submit()
  await settle()
  assert.equal(store.getState().consentOpen, true)
  assert.equal(sent.length, 0)
  store.setState({ rememberConsent: true })
  store.getState().decideCompatibility(false)
  await settle()
  assert.equal(saved.size, 0)
  assert.equal(sent.length, 1)
  assert.equal(sent[0][4], undefined)
  store.setState({ open: true, description: 'another' })
  await store.getState().submit()
  await settle()
  assert.equal(store.getState().consentOpen, true)
  assert.equal(sent.length, 1)
})
test('remembered Include skips the submission prompt only for the same account', async () => {
  const { store, saved, auth, sent } = await fixture()
  store.setState({ open: true, description: 'test' })
  await store.getState().submit()
  await settle()
  store.setState({ rememberConsent: true })
  store.getState().decideCompatibility(true)
  await settle()
  assert.equal(saved.get('compatibility-report-consent-v1:account-a'), 'yes')
  assert.equal(sent[0][4], 'preview')
  store.setState({ open: true, description: 'next' })
  await settle()
  assert.equal(sent.length, 1)
  assert.equal(store.getState().compatibility, null)
  await store.getState().submit()
  await settle()
  assert.equal(store.getState().consentOpen, false)
  assert.equal(sent.length, 2)
  assert.equal(sent[1][4], 'preview')
  auth.setState({ session: { player: { id: 'account-b' } } })
  store.setState({ open: true, description: 'other account' })
  await store.getState().submit()
  await settle()
  assert.equal(store.getState().consentOpen, true)
  assert.equal(sent.length, 2)
})
test('closing the consent modal does not send the report', async () => {
  const { store, sent } = await fixture()
  store.setState({ open: true, description: 'test' })
  await store.getState().submit()
  await settle()
  store.setState({ consentOpen: false, compatibilityPreview: null })
  assert.equal(sent.length, 0)
  assert.equal(store.getState().consentDecided, false)
  await store.getState().submit()
  await settle()
  assert.equal(store.getState().consentOpen, true)
  assert.equal(sent.length, 0)
})

test('failed remembered attachment reopens consent, retains draft, and retries the same snapshot', async () => {
  const failures = { report: 'COMPATIBILITY_UPLOAD_FAILED' }
  const { store, saved, sent, requestedGames } = await fixture({}, failures)
  saved.set('compatibility-report-consent-v1:account-a', 'yes')
  store.setState({
    open: true,
    description: 'Legacy bots never start',
    images: [{ id: 'image', mime: 'image/png', data: 'data' }]
  })
  await store.getState().submit()
  assert.equal(store.getState().consentOpen, true)
  assert.equal(store.getState().busy, false)
  assert.equal(store.getState().consentDecided, false)
  assert.equal(store.getState().rememberConsent, true)
  assert.equal(store.getState().description, 'Legacy bots never start')
  assert.equal(store.getState().images.length, 1)
  // Closing and clicking Submit must not silently reuse a failed decision.
  store.setState({ consentOpen: false })
  await store.getState().submit()
  assert.equal(store.getState().consentOpen, true)
  assert.equal(sent.length, 1)
  failures.report = null
  store.getState().decideCompatibility(true)
  await settle()
  assert.equal(store.getState().open, false)
  assert.equal(sent.length, 2)
  assert.equal(sent[0][4], sent[1][4])
  assert.equal(requestedGames.length, 1)
})

test('attachment rejection allows logs-only submission despite remembered Include', async () => {
  const { store, saved, sent } = await fixture(
    {},
    { report: 'COMPATIBILITY_UPLOAD_LIMIT (HTTP 429)' }
  )
  saved.set('compatibility-report-consent-v1:account-a', 'yes')
  store.setState({ open: true, description: 'test' })
  await store.getState().submit()
  assert.match(store.getState().consentErrorMessage, /limit reached/)
  store.getState().decideCompatibility(false)
  await settle()
  assert.equal(sent.length, 2)
  assert.equal(sent[1][4], undefined)
  assert.equal(store.getState().open, false)
  assert.equal(store.getState().busy, false)
})

test('expired capture can be prepared again without discarding the report', async () => {
  const failures = { report: 'COMPATIBILITY_PREVIEW_EXPIRED' }
  const { store, saved, sent, requestedGames } = await fixture({}, failures)
  saved.set('compatibility-report-consent-v1:account-a', 'yes')
  store.setState({ open: true, description: 'test' })
  await store.getState().submit()
  assert.equal(store.getState().compatibilityPreview, null)
  assert.equal(store.getState().consentOpen, true)
  await store.getState().prepareCompatibility()
  failures.report = null
  store.getState().decideCompatibility(true)
  await settle()
  assert.equal(requestedGames.length, 2)
  assert.equal(sent.length, 2)
  assert.equal(store.getState().open, false)
})

test('failed preparation can be retried within the consent dialog', async () => {
  const failures = { prepare: 'COMPATIBILITY_FILES_UNAVAILABLE' }
  const { store, saved } = await fixture({}, failures)
  saved.set('compatibility-report-consent-v1:account-a', 'yes')
  store.setState({ open: true, description: 'test' })
  await store.getState().submit()
  assert.equal(store.getState().consentOpen, true)
  assert.equal(store.getState().consentError, true)
  failures.prepare = null
  await store.getState().prepareCompatibility()
  assert.equal(store.getState().consentError, false)
  store.getState().decideCompatibility(true)
  await settle()
  assert.equal(store.getState().open, false)
})
