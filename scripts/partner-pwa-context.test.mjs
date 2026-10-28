/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import {
  communityDirectoryPath,
  parseCommunityDirectory
} from '../src/shared/community-directory.ts'

const id = '12345678-1234-4123-8123-123456789abc'
const other = '22345678-1234-4123-8123-123456789abc'
const card = (id) => ({
  id,
  name: 'Community',
  description: '',
  imageUrl: null,
  categories: [],
  countries: [],
  serverCount: 0,
  memberCount: 1
})
const result = (communities, membershipId = other, staff = false) => ({
  communities,
  currentCommunityId: membershipId,
  currentCommunity: membershipId ? card(membershipId) : null,
  canBypassLeaveRestriction: staff,
  viewerCountryCode: null,
  nextCursor: null
})
const query = { cursor: null, search: '', category: '', country: '' }
const source = ts.transpile(
  readFileSync(new URL('../src/web/partner-community-context.ts', import.meta.url), 'utf8'),
  { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
)

function harness(partnerId, branding, membershipId = other, staff = false) {
  const calls = []
  const exports = {}
  const dependencies = {
    '../shared/community-directory': { communityDirectoryPath, parseCommunityDirectory },
    '../shared/partner-branding': { parsePartnerBranding: (response) => response },
    './partner-attribution': { getBrowserPartnerId: () => partnerId },
    './browser-session': {
      currentApiOrigin: () => 'https://example.test',
      requestJson: async (path, options) => {
        assert.equal(options.authenticated, true)
        calls.push(path)
        if (path.includes('/branding/public/')) return { branding }
        if (path.includes('communityId=')) return result([card(id)], membershipId, staff)
        return result([card(other)], membershipId, staff)
      }
    }
  }
  new Function('require', 'exports', source)((name) => dependencies[name], exports)
  return { load: exports.loadBrowserCommunityDirectory, calls }
}

test('restricted partner PWA resolves its own community without fetching discovery or replacing membership', async () => {
  const h = harness(id, { partnerId: id, allowOtherCommunities: false }, id)
  const loaded = await h.load(query)
  assert.equal(loaded.preferredCommunity.id, id)
  assert.equal(loaded.currentCommunityId, id)
  assert.deepEqual(
    loaded.communities.map((row) => row.id),
    [id]
  )
  assert.deepEqual(h.calls, [
    `/partners/branding/public/${id}`,
    `/partners/communities?communityId=${id}`
  ])
})

test('nonmembers and staff can discover other communities through a restricted partner PWA', async () => {
  for (const [membershipId, staff] of [
    [other, false],
    [null, false],
    [id, true]
  ]) {
    const h = harness(id, { partnerId: id, allowOtherCommunities: false }, membershipId, staff)
    const loaded = await h.load(query)
    assert.deepEqual(
      loaded.communities.map((row) => row.id),
      [other]
    )
    assert.equal(loaded.preferredCommunity.id, id)
    assert.equal(h.calls.length, 3)
  }
})

test('enabled partner discovery retains the linked community outside the directory page', async () => {
  const h = harness(id, { partnerId: id, allowOtherCommunities: true })
  const loaded = await h.load(query)
  assert.equal(loaded.preferredCommunity.id, id)
  assert.deepEqual(
    loaded.communities.map((row) => row.id),
    [other]
  )
  assert.equal(h.calls.length, 3)
})

test('ordinary PWA and unavailable partner links retain ordinary community discovery', async () => {
  for (const partnerId of [null, id]) {
    const h = harness(partnerId, null)
    const loaded = await h.load(query)
    assert.equal(loaded.preferredCommunity, undefined)
    assert.deepEqual(
      loaded.communities.map((row) => row.id),
      [other]
    )
  }
  await assert.rejects(harness(id, { partnerId: other }).load(query), /INVALID_COMMUNITY/)
})
