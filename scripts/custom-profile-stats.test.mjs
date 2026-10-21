/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { createElement } from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { twMerge } from 'tailwind-merge'
import { isPlayerProfile } from '../src/shared/player-profile-validation.ts'
import { profileTranslations } from '../src/renderer/src/features/i18n/profile-translations.ts'

const empty = { kills: 0, deaths: 0, assists: 0, wins: 0, losses: 0 }
const category = (mix = false) => ({
  serverId: '12345678-1234-4123-8123-123456789abc',
  communityName: 'My community',
  key: 'future_mode',
  name: 'Future mode',
  mix,
  stats: [
    { key: 'objectives', label: 'Objectives', value: 17 },
    { key: 'kills', label: 'Kills', value: 48 }
  ]
})
const profile = (mix = false) => ({
  id: 'player',
  username: 'Player',
  flagCountryCode: null,
  mmr: 1500,
  wins: 10,
  losses: 5,
  kills: 100,
  deaths: 50,
  assists: 20,
  createdAt: '2026-01-01T00:00:00Z',
  customStats: { categories: [category(mix)], merged: { ...empty, kills: mix ? 48 : 0 } }
})

test('profile validation accepts future categories and legacy responses, rejects malformed counters and forged merge totals', () => {
  assert.equal(isPlayerProfile(profile()), true)
  assert.equal(isPlayerProfile(profile(true)), true)
  const legacy = profile()
  delete legacy.customStats
  assert.equal(isPlayerProfile(legacy), true)
  for (const mutate of [
    (p) => {
      p.customStats.merged.kills = 1
    },
    (p) => {
      p.customStats.categories[0].stats[0].value = -1
    },
    (p) => {
      p.customStats.categories[0].stats[0].value = 1.5
    },
    (p) => {
      p.customStats.categories[0].stats.push(p.customStats.categories[0].stats[0])
    },
    (p) => {
      p.customStats.categories.push(p.customStats.categories[0])
    },
    (p) => {
      p.customStats.categories[0].name = '界'.repeat(22)
    },
    (p) => {
      p.customStats.categories[0].mix = 'yes'
    }
  ]) {
    const p = profile()
    mutate(p)
    assert.equal(isPlayerProfile(p), false)
  }
  const unicode = profile()
  unicode.customStats.categories[0].communityName = '界'.repeat(32)
  assert.equal(isPlayerProfile(unicode), true)
})

async function renderComponent(name, props, language = 'en') {
  const context = vm.createContext({})
  const synthetic = (exports) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  const modules = new Map()
  const load = async (name) => {
    if (modules.has(name)) return modules.get(name)
    const source = await readFile(
      new URL(`../src/renderer/src/features/profile/${name}.tsx`, import.meta.url),
      'utf8'
    )
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText
    const module = new vm.SourceTextModule(code, { context })
    modules.set(name, module)
    await module.link((dep) => {
      if (dep === 'react/jsx-runtime') return synthetic(jsx)
      if (dep === 'tailwind-merge') return synthetic({ twMerge })
      if (dep === '../i18n/i18n')
        return synthetic({
          useTranslation: () => ({
            language,
            t: (key, params = {}) =>
              Object.entries(params).reduce(
                (text, [key, value]) => text.replaceAll('{{' + key + '}}', String(value)),
                profileTranslations[language][key] ?? key
              )
          })
        })
      if (dep === './ProfileCustomStats') return load('ProfileCustomStats')
      return synthetic({ [dep.split('/').at(-1)]: () => null })
    })
    return module
  }
  const module = await load(name)
  await module.evaluate()
  return renderToStaticMarkup(createElement(module.namespace[name], props))
}

test('client renders arbitrary mode counters, escapes partner text and distinguishes separate versus mixed totals', async () => {
  const separate = await renderComponent('ProfileOverview', { profile: profile(), own: false })
  assert.match(separate, /Future mode/)
  assert.match(separate, /Objectives/)
  assert.match(separate, />100</)
  assert.match(separate, /Separate from profile totals/)
  const mixed = await renderComponent('ProfileOverview', { profile: profile(true), own: false })
  assert.match(mixed, />148</)
  assert.match(mixed, /Standard counters included in profile totals/)
  const dangerous = category()
  dangerous.name = '<script>alert(1)</script>'
  const html = await renderComponent('ProfileCustomStats', { categories: [dangerous] })
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
  assert.equal(await renderComponent('ProfileCustomStats', { categories: [] }), '')
})

test('all eight language catalogs cover the custom stats display', async () => {
  const keys = Object.keys(profileTranslations.en).filter((key) =>
    key.startsWith('profile.customStats')
  )
  assert.equal(keys.length, 5)
  for (const [language, catalog] of Object.entries(profileTranslations)) {
    for (const key of keys) assert.equal(typeof catalog[key], 'string', language + ': ' + key)
    const html = await renderComponent('ProfileCustomStats', { categories: [category()] }, language)
    assert.ok(html.includes(catalog['profile.customStats']), language)
    assert.doesNotMatch(html, /profile\.customStats/)
  }
})
