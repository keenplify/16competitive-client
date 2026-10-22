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

test('every VGUI stylesheet selector is gated by the explicit VGUI2 theme', async () => {
  const css = (
    await readFile(new URL('../src/renderer/src/assets/vgui2.css', import.meta.url), 'utf8')
  ).replace(/\/\*[\s\S]*?\*\//g, '')
  let count = 0
  for (const [, header] of css.matchAll(/([^{}]+)\{/g)) {
    const rule = header.trim()
    if (rule.startsWith('@media')) continue
    // Commas inside :where(), :is(), or attribute values do not start a
    // new selector. Check each actual branch independently.
    let depth = 0
    let quote = ''
    let start = 0
    const selectors = []
    for (let i = 0; i < rule.length; i++) {
      const char = rule[i]
      if (quote) {
        if (char === quote && rule[i - 1] !== '\\') quote = ''
      } else if (char === '"' || char === "'") quote = char
      else if (char === '(' || char === '[') depth++
      else if (char === ')' || char === ']') depth--
      else if (char === ',' && depth === 0) {
        selectors.push(rule.slice(start, i).trim())
        start = i + 1
      }
    }
    selectors.push(rule.slice(start).trim())
    for (const selector of selectors) {
      assert.match(selector, /^:root(?::root)?\[data-launcher-theme=['"]vgui2['"]\]/)
      count++
    }
  }
  assert.ok(count > 100, 'The full theme stylesheet must be checked')
})

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

test('re-selecting community mode keeps its resolved VGUI2 style', async () => {
  const h = await harness(new Map([[key, 'community']]))
  h.root.dataset.launcherTheme = 'vgui2'
  h.store.getState().setTheme('community')
  assert.equal(h.root.dataset.launcherTheme, 'vgui2')
  h.store.getState().setTheme('latest')
  assert.equal(h.root.dataset.launcherTheme, 'latest')
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

test('community VGUI colors apply only to community mode and are removed on override or disable', async () => {
  const properties = new Map()
  const root = {
    dataset: {},
    style: {
      setProperty: (key, value) => properties.set(key, value),
      removeProperty: (key) => properties.delete(key)
    },
    removeAttribute: (key) => {
      if (key === 'data-partner-theme') delete root.dataset.partnerTheme
    }
  }
  const appearance = { theme: 'community', hasPreference: true }
  const partner = {
    enabled: true,
    branding: {
      launcherTheme: 'vgui2',
      primaryColor: '#ff00ff',
      secondaryColor: '#ffffff',
      tertiaryColor: '#111133'
    }
  }
  const effects = []
  const context = vm.createContext({ document: { documentElement: root } })
  const synthetic = (exports) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  const themeStore = (selector) => selector(appearance)
  themeStore.getState = () => appearance
  const mocks = {
    react: synthetic({ useEffect: (effect) => effects.push(effect) }),
    '../settings/launcher-theme.store': synthetic({ useLauncherThemeStore: themeStore }),
    '../auth/auth.store': synthetic({ useAuthStore: (selector) => selector({ session: null }) }),
    './partner-branding.store': synthetic({
      usePartnerBrandingStore: (selector) => selector(partner)
    })
  }
  const compileFile = async (file) =>
    ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
    }).outputText
  const palette = new vm.SourceTextModule(
    await compileFile('../src/renderer/src/features/partner-branding/palette.ts'),
    { context }
  )
  await palette.link(() => {
    throw new Error('Unexpected palette import')
  })
  const controller = new vm.SourceTextModule(
    await compileFile('../src/renderer/src/features/partner-branding/PartnerThemeController.tsx'),
    { context }
  )
  const effectiveTheme = new vm.SourceTextModule(
    await compileFile('../src/renderer/src/features/settings/use-effective-launcher-theme.ts'),
    { context }
  )
  await effectiveTheme.link((name) => {
    if (name === './launcher-theme.store') return mocks['../settings/launcher-theme.store']
    if (name === '../partner-branding/partner-branding.store')
      return mocks['./partner-branding.store']
    throw new Error(`Unexpected effective theme import: ${name}`)
  })
  await effectiveTheme.evaluate()
  await controller.link((name) => {
    if (name === './palette') return palette
    if (name === '../settings/use-effective-launcher-theme') return effectiveTheme
    return mocks[name]
  })
  await controller.evaluate()
  const render = () => {
    effects.length = 0
    controller.namespace.PartnerThemeController()
    return effects[1]()
  }
  let cleanup = render()
  assert.equal(root.dataset.launcherTheme, 'vgui2')
  assert.equal(effectiveTheme.namespace.useEffectiveLauncherTheme(), 'vgui2')
  assert.equal(root.dataset.partnerTheme, 'enabled')
  assert.ok(properties.has('--vgui-face'))
  assert.ok(properties.has('--color-neutral-950'))
  for (const explicit of ['latest', 'vgui2']) {
    appearance.theme = explicit
    cleanup()
    render()
    assert.equal(root.dataset.launcherTheme, explicit)
    assert.equal(effectiveTheme.namespace.useEffectiveLauncherTheme(), explicit)
    assert.equal(properties.size, 0)
  }
  appearance.theme = 'community'
  cleanup = render()
  partner.enabled = false
  cleanup()
  render()
  assert.equal(root.dataset.launcherTheme, 'community')
  assert.equal(effectiveTheme.namespace.useEffectiveLauncherTheme(), 'community')
  assert.equal(properties.size, 0)

  partner.enabled = true
  partner.branding.launcherTheme = 'latest'
  render()
  assert.equal(root.dataset.launcherTheme, 'community')
  assert.equal(effectiveTheme.namespace.useEffectiveLauncherTheme(), 'community')
  appearance.hasPreference = false
  appearance.theme = 'latest'
  partner.branding.launcherTheme = 'vgui2'
  render()
  assert.equal(root.dataset.launcherTheme, 'vgui2')
  assert.equal(effectiveTheme.namespace.useEffectiveLauncherTheme(), 'vgui2')
  partner.branding = null
  render()
  assert.equal(root.dataset.launcherTheme, 'latest')
  assert.equal(effectiveTheme.namespace.useEffectiveLauncherTheme(), 'latest')

  const luminance = (hex) =>
    [1, 3, 5]
      .map((offset) => {
        const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const contrast = (a, b) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  for (const color of ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#4c5844']) {
    const tokens = palette.namespace.vguiPalette({
      primaryColor: color,
      secondaryColor: color,
      tertiaryColor: color
    })
    for (const surface of ['--vgui-face', '--vgui-inset']) {
      assert.ok(contrast(tokens['--vgui-text'], tokens[surface]) >= 4.5)
      assert.ok(contrast(tokens['--vgui-accent'], tokens[surface]) >= 4.5)
    }
  }
})
