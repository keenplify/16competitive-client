import assert from 'node:assert/strict'
import test from 'node:test'
import {
  communityDirectoryPath,
  parseCommunityDirectory,
  parseCommunityJoin,
  parseCommunityLeave,
  parseCommunityOwnerSettings,
  parseServerImageUpload,
  validateServerImageUpload,
  validateCommunityJoin,
  validateCommunityUpdate
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
  serverCount: 2,
  memberCount: 17
}
const directory = {
  currentCommunity: null,
  communities: [card],
  currentCommunityId: null,
  viewerCountryCode: 'PH',
  nextCursor: null
}
test('directory contracts validate cards, memberships and safe image URLs', () => {
  assert.deepEqual(parseCommunityDirectory(directory), directory)
  assert.equal(
    parseCommunityDirectory({ ...directory, communities: [{ ...card, memberCount: undefined }] })
      .communities[0].memberCount,
    null
  )
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
    { memberCount: -1 },
    { memberCount: 1.5 },
    { description: 'x'.repeat(1001) }
  ])
    assert.throws(() =>
      parseCommunityDirectory({ ...directory, communities: [{ ...card, ...patch }] })
    )
  assert.throws(() => parseCommunityDirectory({ ...directory, communities: [card, card] }))
  assert.throws(() => parseCommunityDirectory({ ...directory, currentCommunityId: 'bad' }))
  assert.throws(() => parseCommunityDirectory({ ...directory, viewerCountryCode: 'bad' }))
  assert.throws(() => parseCommunityDirectory({ ...directory, nextCursor: 'bad cursor' }))
  assert.throws(() => parseCommunityJoin({ joined: false, communityId: id }))
})
test('directory query bounds and join inputs reject forged IPC values', () => {
  const query = { cursor: 'YWJj', search: 'A&B', category: 'zombie', country: 'PH' }
  const url = new URL(communityDirectoryPath(query), 'https://example.test')
  assert.equal(url.searchParams.get('search'), 'A&B')
  assert.equal(url.searchParams.get('country'), 'PH')
  assert.equal(url.searchParams.get('category'), 'zombie')
  assert.equal(url.searchParams.get('cursor'), 'YWJj')
  assert.equal(url.searchParams.get('timeZone'), Intl.DateTimeFormat().resolvedOptions().timeZone)
  for (const patch of [
    { cursor: 'bad cursor' },
    { cursor: 'a'.repeat(1025) },
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
  validateCommunityUpdate({ name: 'Demo', description: '', servers: [] })
  assert.deepEqual(
    parseCommunityOwnerSettings({
      branding: { communityName: 'Demo', description: '', servers: [] }
    }),
    { name: 'Demo', description: '', servers: [] }
  )
  const server = {
    id,
    name: 'Public',
    host: 'cs.example.test',
    port: 27015,
    category: 'pub',
    countryCode: 'PH',
    gameVersion: 'cs16'
  }
  assert.deepEqual(
    parseCommunityOwnerSettings({
      branding: { communityName: 'Demo', description: '', servers: [server] }
    }).servers,
    [{ ...server, imageUrl: null }]
  )
  assert.throws(() =>
    validateCommunityUpdate({ name: 'Demo', description: '', servers: [server, server] })
  )
  for (const patch of [{ name: '' }, { name: 'x'.repeat(33) }, { description: 'x'.repeat(1001) }])
    assert.throws(() =>
      validateCommunityUpdate({ name: 'Demo', description: '', servers: [], ...patch })
    )
  assert.throws(() =>
    validateCommunityUpdate({
      name: 'Demo',
      description: '',
      servers: [{ id, name: 'Bad', host: 'localhost', port: 27015 }]
    })
  )
})
test('server image uploads accept bounded bytes and safe response URLs', () => {
  validateServerImageUpload(id, new Uint8Array(12))
  for (const [serverId, bytes] of [
    ['bad', new Uint8Array(12)],
    [id, new Uint8Array(11)],
    [id, new Uint8Array(5 * 1024 * 1024 + 1)]
  ]) assert.throws(() => validateServerImageUpload(serverId, bytes))
  const imageUrl = `https://example.test/partners/branding/${id}/servers/${id}/image?v=123`
  assert.deepEqual(parseServerImageUpload({ imageUrl }), { imageUrl })
  for (const url of ['javascript:alert(1)', 'https://user:pass@example.test/image', '/relative/image'])
    assert.throws(() => parseServerImageUpload({ imageUrl: url }))
  assert.throws(() => parseServerImageUpload({ imageUrl: null }))
})
test('all supported languages translate directory, categories and news entry point', () => {
  const keys = Object.keys(communityDirectoryTranslations.en).sort()
  assert.equal(Object.keys(communityDirectoryTranslations).length, 8)
  for (const [lang, copy] of Object.entries(communityDirectoryTranslations)) {
    assert.deepEqual(Object.keys(copy).sort(), keys, lang)
    assert.ok(copy['directory.joinTitle'].includes('{{community}}'), lang)
    assert.ok(copy['directory.serverCount'].includes('{{count}}'), lang)
    assert.ok(copy['directory.memberCount'].includes('{{count}}'), lang)
    for (const value of Object.values(copy)) assert.ok(value.trim(), lang)
  }
})
