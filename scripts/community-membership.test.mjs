import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseCommunityTransfer,
  parseCommunityDecision,
  parseServerLink,
  validateCommunityDecision,
  validateServerLinkCode
} from '../src/shared/community-membership.ts'
const id = '12345678-1234-4123-8123-123456789abc'
test('community transfer contracts reject forged names, identities and ambiguous decisions', () => {
  const request = { id, partnerId: id, currentCommunityId: id, name: 'Community B' }
  assert.deepEqual(parseCommunityTransfer({ request }), request)
  assert.equal(parseCommunityTransfer({ request: null }), null)
  for (const patch of [
    { name: '' },
    { name: 'A'.repeat(65) },
    { name: 'community\ncommand' },
    { id: '../bad' },
    { partnerId: null }
  ])
    assert.throws(() => parseCommunityTransfer({ request: { ...request, ...patch } }))
  assert.throws(() => parseCommunityTransfer({}))
  assert.deepEqual(parseCommunityDecision({ transferred: false }), { transferred: false })
  assert.throws(() => parseCommunityDecision({ transferred: 'true' }))
  assert.doesNotThrow(() => validateCommunityDecision(id, false))
  assert.throws(() => validateCommunityDecision(id, 'yes'))
  assert.throws(() => validateCommunityDecision('../bad', true))
})
test('server linking accepts bounded hex codes and requires a scoped backend acknowledgement', () => {
  assert.doesNotThrow(() => validateServerLinkCode('a1b2c3d4e5f6'))
  for (const code of ['', 'A'.repeat(13), 'ZZZZZZZZZZZZ', '../secret', null])
    assert.throws(() => validateServerLinkCode(code))
  assert.deepEqual(parseServerLink({ linked: true, serverId: id }), { linked: true, serverId: id })
  assert.throws(() => parseServerLink({ linked: true, serverId: '../bad' }))
  assert.throws(() => parseServerLink({ linked: false, serverId: id }))
})

import { communityMembershipTranslations } from '../src/renderer/src/features/i18n/community-membership-translations.ts'
test('all supported languages include community transfer, link, status and error copy', () => {
  const keys = Object.keys(communityMembershipTranslations.en).sort()
  assert.deepEqual(
    Object.keys(communityMembershipTranslations).sort(),
    ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt', 'ja'].sort()
  )
  for (const [language, catalog] of Object.entries(communityMembershipTranslations)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, language)
    assert.ok(catalog['community.transferQuestion'].includes('{{community}}'), language)
    for (const value of Object.values(catalog)) assert.ok(value.trim(), language)
  }
})
