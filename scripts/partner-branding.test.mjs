/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }).outputText
const dependency =
  'data:text/javascript;base64,' +
  Buffer.from(
    compile(await readFile(new URL('../src/shared/partner-community.ts', import.meta.url), 'utf8'))
  ).toString('base64')
const source = compile(
  await readFile(new URL('../src/shared/partner-branding.ts', import.meta.url), 'utf8')
).replace("'./partner-community'", JSON.stringify(dependency))
const { parsePartnerBranding } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
)

const origin = 'https://api.example.test'
const partnerId = '12345678-1234-1234-1234-123456789abc'
const branding = {
  partnerId,
  logoUrl: null,
  communityName: null,
  allowOtherCommunities: true,
  customSocialLinksEnabled: false,
  socialLinks: {},
  servers: [],
  loginBackgroundUrl: null,
  loginBackgroundKind: null,
  primaryColor: '#123456',
  secondaryColor: '#abcdef',
  tertiaryColor: '#AA55CC',
  backgroundKind: 'video',
  backgroundUrl: `${origin}/partners/branding/${partnerId}/asset?v=sha256`
}

test('accepts a verified palette and same-origin media URL', () => {
  assert.deepEqual(parsePartnerBranding({ branding }, origin), { branding })
  assert.deepEqual(parsePartnerBranding({ branding: null }, origin), { branding: null })
})

test('rejects malformed colors and background relationships', () => {
  assert.throws(() =>
    parsePartnerBranding({ branding: { ...branding, primaryColor: 'red' } }, origin)
  )
  assert.throws(() =>
    parsePartnerBranding({ branding: { ...branding, backgroundKind: null } }, origin)
  )
  assert.throws(() =>
    parsePartnerBranding({ branding: { ...branding, partnerId: '../bad' } }, origin)
  )
})

test('rejects external, insecure, and unexpected media URLs', () => {
  for (const url of [
    `https://evil.example.test/partners/branding/${partnerId}/asset?v=sha256`,
    `http://api.example.test/partners/branding/${partnerId}/asset?v=sha256`,
    `${origin}/partners/branding/${partnerId}/other?v=sha256`,
    `${origin}/partners/branding/${partnerId}/asset?v=sha256&next=evil`,
    `${origin}/partners/branding/${partnerId}/asset`
  ]) {
    assert.throws(() =>
      parsePartnerBranding({ branding: { ...branding, backgroundUrl: url } }, origin)
    )
  }
})

test('validates partner logos and supports older branding responses', () => {
  const logoUrl = `${origin}/partners/branding/${partnerId}/logo?v=hash`
  assert.equal(
    parsePartnerBranding({ branding: { ...branding, logoUrl } }, origin).branding.logoUrl,
    logoUrl
  )
  const legacy = { ...branding }
  delete legacy.logoUrl
  assert.equal(parsePartnerBranding({ branding: legacy }, origin).branding.logoUrl, null)
  for (const bad of [
    42,
    `https://elsewhere.test/logo.png`,
    `${origin}/partners/branding/${partnerId}/asset?v=hash`,
    `${logoUrl}&next=evil`,
    `http://api.example.test/partners/branding/${partnerId}/logo?v=hash`
  ]) {
    assert.throws(() => parsePartnerBranding({ branding: { ...branding, logoUrl: bad } }, origin))
  }
})

test('login backgrounds have an independent kind and approved endpoint', () => {
  const loginBackgroundUrl = `${origin}/partners/branding/${partnerId}/login-asset?v=hash`
  const separate = { ...branding, loginBackgroundUrl, loginBackgroundKind: 'image' }
  assert.deepEqual(parsePartnerBranding({ branding: separate }, origin), { branding: separate })
  for (const bad of [
    branding.backgroundUrl,
    'https://evil.example/login.png',
    `${loginBackgroundUrl}&next=bad`
  ]) {
    assert.throws(() =>
      parsePartnerBranding({ branding: { ...separate, loginBackgroundUrl: bad } }, origin)
    )
  }
  assert.throws(() =>
    parsePartnerBranding({ branding: { ...separate, loginBackgroundKind: null } }, origin)
  )
  const legacy = { ...branding }
  delete legacy.loginBackgroundUrl
  delete legacy.loginBackgroundKind
  assert.equal(parsePartnerBranding({ branding: legacy }, origin).branding.loginBackgroundUrl, null)
})

test('validates community discovery preference and defaults older responses to enabled', () => {
  const legacy = { ...branding }
  delete legacy.allowOtherCommunities
  assert.equal(
    parsePartnerBranding({ branding: legacy }, origin).branding.allowOtherCommunities,
    true
  )
  assert.equal(
    parsePartnerBranding({ branding: { ...branding, allowOtherCommunities: false } }, origin)
      .branding.allowOtherCommunities,
    false
  )
  for (const bad of ['false', 0, null, {}]) {
    assert.throws(() =>
      parsePartnerBranding({ branding: { ...branding, allowOtherCommunities: bad } }, origin)
    )
  }
})

test('accepts community launcher styles, rejects invalid styles and supports older responses', () => {
  for (const launcherTheme of ['latest', 'vgui2']) {
    assert.equal(
      parsePartnerBranding({ branding: { ...branding, launcherTheme } }, origin).branding
        .launcherTheme,
      launcherTheme
    )
  }
  assert.equal(parsePartnerBranding({ branding }, origin).branding.launcherTheme, undefined)
  for (const launcherTheme of [null, 'community', 'unknown', 0, {}]) {
    assert.throws(() => parsePartnerBranding({ branding: { ...branding, launcherTheme } }, origin))
  }
})

test('installed branding validates download policy, shortcut names and hash-bound icon endpoints', () => {
  const hash = 'a'.repeat(64)
  const appIcon = {
    pngUrl: `${origin}/partners/branding/${partnerId}/app-icon?v=${hash}`,
    icoUrl: `${origin}/partners/branding/${partnerId}/app-icon.ico?v=${hash}`,
    smallUrl: `${origin}/partners/branding/${partnerId}/app-icon-192?v=${hash}`,
    pngSha256: hash,
    icoSha256: hash,
    smallSha256: hash
  }
  const value = { ...branding, appName: 'Partner App', desktopAppEnabled: false, appIcon }
  assert.equal(parsePartnerBranding({ branding: value }, origin).branding.appName, 'Partner App')
  assert.equal(parsePartnerBranding({ branding: value }, origin).branding.desktopAppEnabled, false)
  for (const appName of ['../Other', 'bad\nExec=evil', 'CON', 'name.'])
    assert.throws(() => parsePartnerBranding({ branding: { ...value, appName } }, origin))
  assert.throws(() =>
    parsePartnerBranding({ branding: { ...value, desktopAppEnabled: 'false' } }, origin)
  )
  assert.throws(() =>
    parsePartnerBranding(
      { branding: { ...value, appIcon: { ...appIcon, pngSha256: 'b'.repeat(64) } } },
      origin
    )
  )
  assert.throws(() =>
    parsePartnerBranding(
      { branding: { ...value, appIcon: { ...appIcon, icoUrl: 'https://evil.example/icon.ico' } } },
      origin
    )
  )
})
