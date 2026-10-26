import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseWebHelperCheckLink,
  parseWebHelperLink,
  webHelperCheckUrl,
  webHelperLaunchUrl
} from '../src/shared/web-helper-link.ts'

const handoff = 'a'.repeat(43)
const matchId = '426aaf31-e665-4cee-8bd5-56475ea5db38'
const apiOrigin = 'https://euw.16competitive.papamo.dev'

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
  assert.equal(parseWebHelperLink(webHelperLaunchUrl({ apiOrigin, handoff, matchId }) + '&password=secret'), null)
  assert.throws(() => webHelperCheckUrl({ apiOrigin: 'https://euw.16competitive.papamo.dev.evil.test', handoff }))
})
