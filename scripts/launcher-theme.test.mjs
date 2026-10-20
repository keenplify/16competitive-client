/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

const source = ts.transpileModule(
  await readFile(
    new URL('../src/renderer/src/features/settings/launcher-theme.store.ts', import.meta.url),
    'utf8'
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
).outputText
const key = '16competitive.launcher-theme'
async function harness(storage = new Map(), blocked = false) {
  const root = { dataset: {} }
  const context = vm.createContext({
    document: { documentElement: root },
    window: {
      localStorage: {
        getItem: (name) => {
          if (blocked) throw new Error('Storage blocked')
          return storage.get(name) ?? null
        },
        setItem: (name, value) => {
          if (blocked) throw new Error('Storage blocked')
          storage.set(name, value)
        }
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
  const module = new vm.SourceTextModule(source, { context })
  await module.link(() => zustand)
  await module.evaluate()
  return { store: module.namespace.useLauncherThemeStore, root, storage }
}

test('new players and invalid preferences retain the latest design', async () => {
  for (const saved of [undefined, 'unrecognized']) {
    const h = await harness(new Map(saved ? [[key, saved]] : []))
    assert.equal(h.store.getState().theme, 'latest')
    assert.equal(h.store.getState().hasPreference, false)
    assert.equal(h.root.dataset.launcherTheme, 'latest')
  }
})

test('each explicit appearance choice persists and applies before first render after restart', async () => {
  const h = await harness()
  for (const theme of ['vgui2', 'community', 'latest']) {
    h.store.getState().setTheme(theme)
    assert.equal(h.root.dataset.launcherTheme, theme)
    const restarted = await harness(h.storage)
    assert.equal(restarted.store.getState().theme, theme)
    assert.equal(restarted.store.getState().hasPreference, true)
    assert.equal(restarted.root.dataset.launcherTheme, theme)
  }
})

test('community onboarding defaults once and never replaces an explicit choice', async () => {
  const h = await harness()
  h.store.getState().offerCommunityDefault()
  assert.equal(h.store.getState().theme, 'community')
  assert.equal(h.storage.get(key), 'community')
  for (const theme of ['latest', 'vgui2']) {
    h.store.getState().setTheme(theme)
    h.store.getState().offerCommunityDefault()
    assert.equal(h.store.getState().theme, theme)
    const restarted = await harness(h.storage)
    restarted.store.getState().offerCommunityDefault()
    assert.equal(restarted.store.getState().theme, theme)
  }
})

test('blocked local storage still allows session choices and respects them', async () => {
  const h = await harness(new Map(), true)
  assert.equal(h.store.getState().theme, 'latest')
  h.store.getState().setTheme('vgui2')
  h.store.getState().offerCommunityDefault()
  assert.equal(h.root.dataset.launcherTheme, 'vgui2')
})

test('all supported languages cover the entire appearance picker', async () => {
  const source = await readFile(
    new URL('../src/renderer/src/features/i18n/launcher-theme-translations.ts', import.meta.url),
    'utf8'
  )
  const module = new vm.SourceTextModule(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
  )
  await module.link(() => {
    throw new Error('Unexpected import')
  })
  await module.evaluate()
  const translations = module.namespace.launcherThemeTranslations
  const keys = Object.keys(translations.en).sort()
  for (const code of ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt', 'ja']) {
    assert.deepEqual(Object.keys(translations[code]).sort(), keys)
    assert.ok(
      Object.values(translations[code]).every(
        (value) => typeof value === 'string' && value.length > 0
      )
    )
  }
})
