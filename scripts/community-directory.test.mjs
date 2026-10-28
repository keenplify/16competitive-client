import { createLocalSnapshotCache } from '../src/shared/local-snapshot-cache.ts'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { create } from 'zustand'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  communityDirectoryPath,
  communityUpdateBody,
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
  memberCount: 17,
  canLeave: true
}
const directory = {
  currentCommunity: null,
  communities: [card],
  currentCommunityId: null,
  canBypassLeaveRestriction: false,
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
  validateCommunityUpdate({
    name: 'Demo',
    communityCountryCode: 'PH',
    description: '',
    servers: []
  })
  assert.equal(
    communityUpdateBody({ name: 'Demo', communityCountryCode: 'PH', description: '', servers: [] })
      .communityCountryCode,
    'PH'
  )
  assert.equal(
    parseCommunityOwnerSettings({
      branding: { communityName: 'Demo', communityCountryCode: 'PH', description: '', servers: [] }
    }).communityCountryCode,
    'PH'
  )
  assert.deepEqual(
    parseCommunityOwnerSettings({
      branding: { communityName: 'Demo', description: '', servers: [] }
    }),
    { name: 'Demo', communityCountryCode: null, description: '', servers: [] }
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
    validateCommunityUpdate({
      name: 'Demo',
      communityCountryCode: null,
      description: '',
      servers: [server, server]
    })
  )
  for (const patch of [
    { name: '' },
    { name: 'x'.repeat(33) },
    { description: 'x'.repeat(1001) },
    { communityCountryCode: 'ZZZ' }
  ])
    assert.throws(() =>
      validateCommunityUpdate({
        name: 'Demo',
        communityCountryCode: null,
        description: '',
        servers: [],
        ...patch
      })
    )
  assert.throws(() =>
    validateCommunityUpdate({
      name: 'Demo',
      communityCountryCode: null,
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
  ])
    assert.throws(() => validateServerImageUpload(serverId, bytes))
  const imageUrl = `https://example.test/partners/branding/${id}/servers/${id}/image?v=123`
  assert.deepEqual(parseServerImageUpload({ imageUrl }), { imageUrl })
  for (const url of [
    'javascript:alert(1)',
    'https://user:pass@example.test/image',
    '/relative/image'
  ])
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function rendererStore(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  })
  const exports = {}
  const memory = new Map()
  const cache = createLocalSnapshotCache(
    'test',
    (value) => value,
    () => ({
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value)
    })
  )
  new Function('require', 'exports', 'window', compiled)(
    (name) =>
      name === 'zustand'
        ? { create }
        : (dependencies[name] ??
          (name.endsWith('/community-cache')
            ? { communityDirectoryCache: cache, communityServerCache: cache }
            : null) ??
          (name === '../partner-branding/partner-branding.store'
            ? { usePartnerBrandingStore: { getState: () => ({ branding: null }) } }
            : {})),
    exports,
    dependencies.window
  )
  return exports
}

test('opening another community preserves membership and does not join', () => {
  const { useCommunitiesStore: store } = rendererStore(
    '../src/renderer/src/features/communities/communities.store.ts',
    {}
  )
  const other = { ...card, id: '22345678-1234-4123-8123-123456789abc' }
  store.setState({ currentCommunity: card, currentCommunityId: id, loading: false })
  store.getState().setView('discover')
  store.getState().openCommunity(other)
  assert.equal(store.getState().viewedCommunity.id, other.id)
  assert.equal(store.getState().currentCommunityId, id)
  assert.equal(store.getState().selected, null)
  store.getState().setView('discover')
  assert.equal(store.getState().viewedCommunity, null)
  store.getState().clear()
  assert.equal(store.getState().currentCommunityId, null)
})

test('visitor server lists and launch targets stay isolated from membership servers', async () => {
  const calls = []
  const { createPartnerServersStore } = rendererStore(
    '../src/renderer/src/features/partner-branding/partner-servers.store.ts',
    {
      '../auth/auth.store': { useAuthStore: { getState: () => ({ session: { player: { id } } }) } },
      '../../../../shared/partner-community': { sortPartnerServers: (rows) => rows },
      window: {
        api: {
          partnerServers: {
            list: async (communityId) => [{ id: communityId ?? 'own-server' }],
            connect: async (...args) => {
              calls.push(args)
            }
          }
        }
      }
    }
  )
  const own = createPartnerServersStore()
  const visitor = createPartnerServersStore(id)
  await Promise.all([own.getState().load(), visitor.getState().load()])
  assert.equal(own.getState().rows[0].id, 'own-server')
  assert.equal(visitor.getState().rows[0].id, id)
  visitor.getState().select(id)
  await visitor.getState().connect()
  assert.deepEqual(calls, [[id, undefined, id]])
  assert.equal(own.getState().selectedId, null)
})

test('visitor member lists isolate own community data, pagination and late responses', async () => {
  const otherId = '22345678-1234-4123-8123-123456789abc'
  const requests = [],
    pending = []
  const auth = create(() => ({ session: { player: { id } } }))
  const { createCommunityMembersStore, useCommunityMembersStore: own } = rendererStore(
    '../src/renderer/src/features/partner-branding/community-members.store.ts',
    {
      '../auth/auth.store': { useAuthStore: auth },
      window: {
        api: {
          communityChat: {
            members: (page, communityId) => {
              requests.push([page, communityId])
              return new Promise((resolve) => pending.push(resolve))
            }
          }
        }
      }
    }
  )
  const visitor = createCommunityMembersStore(otherId, id)
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const roster = (communityId, username, hasMore = false) => ({
    communityId,
    name: communityId,
    members: [{ id: username, username, relationship: 'NONE' }],
    total: 2,
    hasMore
  })
  const ownLoad = own.getState().load(),
    visitorLoad = visitor.getState().load()
  pending[1](roster(otherId, 'Visitor member', true))
  await visitorLoad
  pending[0](roster(id, 'Own member'))
  await ownLoad
  assert.equal(visitor.getState().members[0].username, 'Visitor member')
  assert.equal(own.getState().members[0].username, 'Own member')
  const more = visitor.getState().load(true)
  pending[2](roster(otherId, 'Another visitor member'))
  await more
  assert.deepEqual(requests, [
    [1, undefined],
    [1, otherId],
    [2, otherId]
  ])
  assert.deepEqual(
    visitor.getState().members.map((member) => member.username),
    ['Visitor member', 'Another visitor member']
  )
  const stale = visitor.getState().load()
  visitor.getState().clear()
  pending[3](roster(otherId, 'Stale member'))
  await stale
  assert.equal(visitor.getState().members.length, 0)
  const wrongScope = visitor.getState().load()
  pending[4](roster(id, 'Wrong community'))
  await wrongScope
  assert.equal(visitor.getState().error, true)
  assert.equal(visitor.getState().members.length, 0)
  assert.equal(own.getState().members[0].username, 'Own member')
  const previousAccount = visitor.getState().load()
  auth.setState({ session: { player: { id: otherId } } })
  pending[5](roster(otherId, 'Old account response'))
  await previousAccount
  assert.equal(visitor.getState().members.length, 0)
  await visitor.getState().load()
  assert.equal(requests.length, 6)
  assert.equal(visitor.getState().accountId, null)
})

test('community details and member sidebar resolve the viewed community, including restricted partner context', () => {
  const other = { ...card, id: '22345678-1234-4123-8123-123456789abc', name: 'Viewed community' }
  const state = {
    currentCommunity: card,
    currentCommunityId: id,
    canBypassLeaveRestriction: false,
    viewedCommunity: other,
    preferredCommunity: other
  }
  let branding = null
  const { useDisplayedCommunity } = rendererStore(
    '../src/renderer/src/features/communities/use-displayed-community.ts',
    {
      './communities.store': { useCommunitiesStore: (select) => select(state) },
      '../partner-branding/partner-branding.store': {
        usePartnerBrandingStore: (select) => select({ branding })
      }
    }
  )
  assert.equal(useDisplayedCommunity().id, other.id)
  state.viewedCommunity = null
  assert.equal(useDisplayedCommunity().id, id)
  branding = { partnerId: other.id, allowOtherCommunities: false }
  assert.equal(useDisplayedCommunity().id, id)
  state.currentCommunityId = other.id
  assert.equal(useDisplayedCommunity().id, other.id)
  state.canBypassLeaveRestriction = true
  assert.equal(useDisplayedCommunity().id, id)
})

test('partner PWA activates its preferred community without silently changing membership', async () => {
  const other = { ...card, id: '22345678-1234-4123-8123-123456789abc' }
  const { useCommunitiesStore: store } = rendererStore(
    '../src/renderer/src/features/communities/communities.store.ts',
    {
      '../auth/auth.store': { useAuthStore: { getState: () => ({ session: { player: { id } } }) } },
      window: {
        api: {
          communityDirectory: {
            list: async () => ({
              ...directory,
              preferredCommunity: other,
              currentCommunity: card,
              currentCommunityId: id
            })
          }
        }
      }
    }
  )
  await store.getState().load()
  assert.equal(store.getState().viewedCommunity.id, other.id)
  assert.equal(store.getState().currentCommunityId, id)
  assert.equal(store.getState().view, 'home')
  store.getState().setView('discover')
  await store.getState().load()
  assert.equal(store.getState().view, 'discover')
  store.getState().clear()
  assert.equal(store.getState().preferredCommunity, null)
})

test('disabled community discovery blocks navigation and selection, independently of theme preference', () => {
  const other = { ...card, id: '22345678-1234-4123-8123-123456789abc' }
  const branding = { partnerId: id, allowOtherCommunities: false }
  const { useCommunitiesStore: store } = rendererStore(
    '../src/renderer/src/features/communities/communities.store.ts',
    {
      '../partner-branding/partner-branding.store': {
        usePartnerBrandingStore: { getState: () => ({ branding, enabled: false }) }
      }
    }
  )
  store.setState({ currentCommunity: card, currentCommunityId: id, loading: false })
  store.getState().setView('discover')
  store.getState().openCommunity(other)
  store.getState().select(other)
  store.getState().updateQuery({ search: 'other' })
  assert.equal(store.getState().view, 'home')
  assert.equal(store.getState().viewedCommunity, null)
  assert.equal(store.getState().selected, null)
  assert.equal(store.getState().query.search, '')
  branding.allowOtherCommunities = true
  store.getState().setView('discover')
  store.getState().openCommunity(other)
  assert.equal(store.getState().viewedCommunity.id, other.id)
})

test('nonmembers and staff can open other communities in a restricted partner theme', () => {
  const other = { ...card, id: '22345678-1234-4123-8123-123456789abc' }
  const branding = { partnerId: id, allowOtherCommunities: false }
  const { useCommunitiesStore: store } = rendererStore(
    '../src/renderer/src/features/communities/communities.store.ts',
    {
      '../partner-branding/partner-branding.store': {
        usePartnerBrandingStore: { getState: () => ({ branding, enabled: true }) }
      }
    }
  )
  store.setState({ currentCommunityId: null, loading: false })
  store.getState().setView('discover')
  store.getState().openCommunity(other)
  assert.equal(store.getState().viewedCommunity.id, other.id)
  store.setState({ currentCommunityId: id, canBypassLeaveRestriction: true })
  store.getState().setView('discover')
  store.getState().openCommunity(other)
  assert.equal(store.getState().viewedCommunity.id, other.id)
})

test('disabled discovery blocks leave requests and stale confirmations without calling IPC', async () => {
  const branding = { partnerId: id, allowOtherCommunities: true }
  let calls = 0
  const { useCommunitiesStore: store } = rendererStore(
    '../src/renderer/src/features/communities/communities.store.ts',
    {
      '../partner-branding/partner-branding.store': {
        usePartnerBrandingStore: { getState: () => ({ branding, enabled: false }) }
      },
      '../auth/auth.store': { useAuthStore: { getState: () => ({ session: { player: { id } } }) } },
      window: {
        api: {
          communityDirectory: {
            leave: async () => {
              calls++
              throw Error('offline')
            },
            list: async () => directory
          }
        }
      }
    }
  )
  store.setState({ currentCommunity: card, currentCommunityId: id, loading: false })
  store.getState().requestLeave(true)
  assert.equal(store.getState().leaveRequested, true)
  branding.allowOtherCommunities = false
  await store.getState().leave()
  assert.equal(calls, 0)
  assert.equal(store.getState().currentCommunityId, id)
  assert.equal(store.getState().joining, false)
  store.getState().requestLeave(false)
  store.getState().requestLeave(true)
  assert.equal(store.getState().leaveRequested, false)
  branding.allowOtherCommunities = true
  store.getState().requestLeave(true)
  assert.equal(store.getState().leaveRequested, true)
  await store.getState().leave()
  assert.equal(calls, 1)
})

test('server snapshots show immediately while refreshing, update afterward, survive failed refreshes', async () => {
  let response = Promise.resolve([{ id: 'server', pingMs: 30, players: 2, map: 'de_dust2' }])
  const { createPartnerServersStore } = rendererStore(
    '../src/renderer/src/features/partner-branding/partner-servers.store.ts',
    {
      '../auth/auth.store': { useAuthStore: { getState: () => ({ session: { player: { id } } }) } },
      '../../../../shared/partner-community': { sortPartnerServers: (rows) => rows },
      window: { api: { partnerServers: { list: () => response } } }
    }
  )
  await createPartnerServersStore(id).getState().load()
  let finish
  response = new Promise((resolve) => {
    finish = resolve
  })
  const next = createPartnerServersStore(id)
  const pending = next.getState().load()
  assert.equal(next.getState().rows[0].pingMs, 30)
  assert.equal(next.getState().status, 'ready')
  next.getState().select('server')
  finish([{ id: 'server', pingMs: 55, players: 7, map: 'de_nuke' }])
  await pending
  assert.equal(next.getState().rows[0].players, 7)
  assert.equal(next.getState().rows[0].map, 'de_nuke')
  assert.equal(next.getState().selectedId, 'server')
  response = Promise.reject(Error('offline'))
  await next.getState().load()
  assert.equal(next.getState().rows[0].pingMs, 55)
  assert.equal(next.getState().status, 'ready')
})

test('community cache displays before its network refresh finishes', async () => {
  let response = Promise.resolve(directory)
  const { useCommunitiesStore: store } = rendererStore(
    '../src/renderer/src/features/communities/communities.store.ts',
    {
      '../auth/auth.store': { useAuthStore: { getState: () => ({ session: { player: { id } } }) } },
      window: { api: { communityDirectory: { list: () => response } } }
    }
  )
  await store.getState().load()
  store.getState().clear()
  let finish
  response = new Promise((resolve) => {
    finish = resolve
  })
  const pending = store.getState().load()
  assert.equal(store.getState().communities[0].name, card.name)
  assert.equal(store.getState().loading, false)
  finish({ ...directory, communities: [{ ...card, name: 'Updated name' }] })
  await pending
  assert.equal(store.getState().communities[0].name, 'Updated name')
})
