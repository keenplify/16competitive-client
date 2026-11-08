/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

async function fixture() {
  const auth = create(() => ({ session: { player: { id: 'account-a' } } }))
  const saved = new Map(),
    sent = []
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
          compatibility: async () => preview,
          report: async (...args) => sent.push(args)
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
                    ? { useMatchmakingStore: { getState: () => ({}) } }
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
  return { store: module.namespace.useIssueReport, auth, saved, sent }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('Not now never saves refusal or attaches files, even when Remember is checked', async () => {
  const { store, saved, sent } = await fixture()
  store.setState({ open: true, description: 'test' })
  await settle()
  assert.equal(store.getState().consentOpen, true)
  assert.equal(store.getState().compatibility, null)
  store.setState({ rememberConsent: true })
  store.getState().decideCompatibility(false)
  assert.equal(saved.size, 0)
  await store.getState().submit()
  assert.equal(sent[0][4], undefined)
  store.setState({ open: true })
  await settle()
  assert.equal(store.getState().consentOpen, true)
})
test('remembered Include skips future prompts only for the same account and can be cleared', async () => {
  const { store, saved, auth } = await fixture()
  store.setState({ open: true })
  await settle()
  store.setState({ rememberConsent: true })
  store.getState().decideCompatibility(true)
  assert.equal(saved.get('compatibility-report-consent-v1:account-a'), 'yes')
  store.setState({ open: false })
  store.setState({ open: true })
  await settle()
  assert.equal(store.getState().consentOpen, false)
  assert.equal(store.getState().compatibility.id, 'preview')
  store.getState().openCompatibility()
  await settle()
  store.setState({ rememberConsent: false })
  store.getState().decideCompatibility(true)
  assert.equal(saved.size, 0)
  auth.setState({ session: { player: { id: 'account-b' } } })
  assert.equal(store.getState().compatibility, null)
  store.setState({ open: true })
  await settle()
  assert.equal(store.getState().consentOpen, true)
})
