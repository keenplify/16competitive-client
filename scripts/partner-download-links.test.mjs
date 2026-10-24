/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
async function hook(metadata = {}, branding = null) {
  const context = vm.createContext({
    URL,
    window: { __SIXTEEN_COMPETITIVE_WEB__: true, location: { origin: 'https://partner.example' } },
    navigator: { userAgent: 'Linux x86_64' },
    document: {
      querySelector: (selector) => {
        const key = selector.match(/name="([^"]+)"/)[1]
        return key in metadata ? { content: metadata[key] } : null
      }
    }
  })
  const source = ts.transpileModule(
    await readFile(
      new URL('../src/renderer/src/features/community/links.ts', import.meta.url),
      'utf8'
    ),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }
  ).outputText
  const mod = new vm.SourceTextModule(source, { context })
  const deps = {
    '../i18n/i18n': { useTranslation: () => ({ language: 'en' }) },
    '../partner-branding/community-copy': { communityText: () => '' },
    '../partner-branding/partner-branding.store': {
      usePartnerBrandingStore: (selector) => selector({ branding, enabled: false })
    },
    '../../../../shared/partner-community': { partnerSocialLabels: {} }
  }
  await mod.link(
    (name) =>
      new vm.SyntheticModule(
        Object.keys(deps[name]),
        function () {
          for (const [key, value] of Object.entries(deps[name])) this.setExport(key, value)
        },
        { context }
      )
  )
  await mod.evaluate()
  return mod.namespace.useDesktopAppUrl()
}
test('disabled partner downloads remove the link even if another account community allows them', async () => {
  assert.equal(
    await hook({ '16c-desktop-downloads': 'disabled' }, { desktopAppEnabled: true }),
    null
  )
  assert.equal(await hook({}, { desktopAppEnabled: false }), null)
})
test('downloads default to enabled and do not depend on the visual theme preference', async () => {
  assert.equal(await hook(), 'https://papamo.dev/16competitive')
  const id = '12345678-1234-4123-8123-123456789abc'
  const link = await hook(
    { '16c-partner-id': id, '16c-api-origin': 'https://api.example' },
    { partnerId: '22345678-1234-4123-8123-123456789abc', desktopAppEnabled: true }
  )
  const url = new URL(link)
  assert.equal(url.origin, 'https://api.example')
  assert.equal(url.pathname, '/partners/download/linux')
  assert.equal(url.searchParams.get('partnerId'), id)
  assert.equal(url.searchParams.get('arch'), 'x64')
})
