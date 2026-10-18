import assert from 'node:assert/strict'
import test from 'node:test'
import {
  communityDirectoryPath,
  parseCommunityDirectory,
  parseCommunityJoin,
  parseCommunityLeave,
  validateCommunityJoin
} from '../src/shared/community-directory.ts'
import { communityDirectoryTranslations } from '../src/renderer/src/features/i18n/community-directory-translations.ts'
const id = '12345678-1234-4123-8123-123456789abc'
const card = {
  id,
  name: 'SEA community',
  description: '<script>plain text</script>',
  imageUrl: 'https://example.test/picture.png',
  categories: ['zombie', 'pub'],
  countries: ['PH', 'SG'],
  serverCount: 2
}
const directory = {
  currentCommunity: null,
  communities: [card],
  currentCommunityId: null,
  viewerCountryCode: 'PH',
  hasMore: false
}
test('directory contracts validate cards, memberships and safe image URLs', () => {
  assert.deepEqual(parseCommunityDirectory(directory), directory)
  assert.deepEqual(
    parseCommunityDirectory({ ...directory, currentCommunityId: id, currentCommunity: card })
      .currentCommunity,
    card
  )
  assert.throws(() =>
    parseCommunityDirectory({ ...directory, currentCommunityId: id, currentCommunity: null })
  )
  assert.deepEqual(parseCommunityLeave({ left: true }), { left: true })
  assert.throws(() => parseCommunityLeave({ left: 'true' }))
  assert.deepEqual(parseCommunityJoin({ joined: true, communityId: id }), {
    joined: true,
    communityId: id
  })
  for (const patch of [
    { id: 'bad' },
    { imageUrl: 'javascript:alert(1)' },
    { imageUrl: 'https://user:password@example.test/x' },
    { categories: ['unsupported'] },
    { countries: ['Philippines'] },
    { serverCount: 17 },
    { description: 'x'.repeat(1001) }
  ])
    assert.throws(() =>
      parseCommunityDirectory({ ...directory, communities: [{ ...card, ...patch }] })
    )
  assert.throws(() => parseCommunityDirectory({ ...directory, communities: [card, card] }))
  assert.throws(() => parseCommunityDirectory({ ...directory, currentCommunityId: 'bad' }))
  assert.throws(() => parseCommunityDirectory({ ...directory, viewerCountryCode: 'bad' }))
  assert.throws(() => parseCommunityJoin({ joined: false, communityId: id }))
})
test('directory query bounds and join inputs reject forged IPC values', () => {
  const query = { page: 2, search: 'A&B', category: 'zombie', country: 'PH' }
  const url = new URL(communityDirectoryPath(query), 'https://example.test')
  assert.equal(url.searchParams.get('search'), 'A&B')
  assert.equal(url.searchParams.get('country'), 'PH')
  assert.equal(url.searchParams.get('category'), 'zombie')
  assert.equal(url.searchParams.get('timeZone'), Intl.DateTimeFormat().resolvedOptions().timeZone)
  for (const patch of [
    { page: 0 },
    { page: 10001 },
    { search: 'x'.repeat(101) },
    { category: 'bad' },
    { country: '../PH' }
  ])
    assert.throws(() => communityDirectoryPath({ ...query, ...patch }))
  validateCommunityJoin(id, null)
  validateCommunityJoin(id, id)
  for (const args of [
    ['../x', null],
    [id, undefined],
    [id, 'false']
  ])
    assert.throws(() => validateCommunityJoin(...args))
})
test('all supported languages translate directory, categories and news entry point', () => {
  const keys = Object.keys(communityDirectoryTranslations.en).sort()
  assert.equal(Object.keys(communityDirectoryTranslations).length, 8)
  for (const [lang, copy] of Object.entries(communityDirectoryTranslations)) {
    assert.deepEqual(Object.keys(copy).sort(), keys, lang)
    assert.ok(copy['directory.joinTitle'].includes('{{community}}'), lang)
    assert.ok(copy['directory.serverCount'].includes('{{count}}'), lang)
    for (const value of Object.values(copy)) assert.ok(value.trim(), lang)
  }
})
