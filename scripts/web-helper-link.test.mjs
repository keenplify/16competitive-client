import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webHelperTranslations } from '../src/renderer/src/features/i18n/web-helper-translations.ts'
import {
  allowedHelperApiOrigin,
  allowedHelperWebOrigin,
  parseWebHelperCheckLink,
  parseWebHelperLink,
  webHelperCheckUrl,
  webHelperLaunchUrl
} from '../src/shared/web-helper-link.ts'

const handoff = 'a'.repeat(43)
const matchId = '426aaf31-e665-4cee-8bd5-56475ea5db38'
const apiOrigin = 'https://euw.16competitive.papamo.dev'

test('helper version labels use the app interpolation syntax in every language', () => {
  for (const [language, copy] of Object.entries(webHelperTranslations)) {
    for (const key of ['webHelper.installedVersion', 'webHelper.latestVersion']) {
      assert.ok(copy[key].includes('{{version}}'), `${language}: ${key}`)
      assert.equal(copy[key].split('{{version}}').join('2026.1028.8').includes('{version}'), false)
    }
  }
})

test('desktop web links carry only bounded handoff, match and regional API fields', () => {
  assert.deepEqual(parseWebHelperCheckLink(webHelperCheckUrl({ apiOrigin, handoff })), {
    apiOrigin,
    handoff
  })
  assert.deepEqual(parseWebHelperLink(webHelperLaunchUrl({ apiOrigin, handoff, matchId })), {
    apiOrigin,
    handoff,
    matchId
  })
  assert.equal(
    parseWebHelperLink(webHelperLaunchUrl({ apiOrigin, handoff, matchId }) + '&password=secret'),
    null
  )
  assert.throws(() =>
    webHelperCheckUrl({ apiOrigin: 'https://euw.16competitive.papamo.dev.evil.test', handoff })
  )
})

test('partner browser origin is accepted without trusting it as an API destination', () => {
  const origin = 'https://counterstrike.olaguergeyming.com'
  const localSettings = { origin, port: 55001, token: 'b'.repeat(64) }
  const input = { apiOrigin, handoff, localSettings }
  const link = webHelperCheckUrl(input, false, 'competitive16-helper')
  assert.deepEqual(parseWebHelperCheckLink(link, false, 'competitive16-helper'), input)
  assert.equal(allowedHelperApiOrigin(origin), null)
  for (const bad of [
    origin + '.evil.test',
    origin + '/path',
    origin + '?x=1',
    'http://counterstrike.olaguergeyming.com',
    'https://evil.test'
  ]) {
    assert.equal(allowedHelperWebOrigin(bad), null)
  }
})
