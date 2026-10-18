/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createSocket } from 'node:dgram'
import {
  parseCommunityBranding,
  isPublicIPv4,
  isLocalPartnerIPv4,
  sortPartnerServers,
  parseCommunityHistory,
  parseCommunityMembers,
  parsePartnerServerStatuses
} from '../src/shared/partner-community.ts'
import { parseServerInfo, queryServerInfo } from '../src/main/game/partner-server-query.ts'
const id = '12345678-1234-1234-1234-123456789abc'
const strings = (values) => Buffer.from(values.join('\0') + '\0')
const modern = Buffer.concat([
  Buffer.from([255, 255, 255, 255, 0x49, 48]),
  strings(['Fixture', 'de_dust2', 'cstrike', 'Counter-Strike']),
  Buffer.from([10, 0, 12, 32, 0, 100, 108, 0, 1]),
  strings(['1.1.2.7'])
])
test('modern and legacy HLDS counts, map and malformed replies', () => {
  assert.deepEqual(parseServerInfo(modern), { map: 'de_dust2', players: 12, maxPlayers: 32 })
  const legacy = Buffer.concat([
    Buffer.from([255, 255, 255, 255, 0x6d]),
    strings(['8.8.8.8:27015', 'Fixture', 'de_inferno', 'cstrike', 'Counter-Strike']),
    Buffer.from([7, 31, 48])
  ])
  assert.deepEqual(parseServerInfo(legacy), { map: 'de_inferno', players: 7, maxPlayers: 31 })
  for (const packet of [
    modern.subarray(0, 10),
    Buffer.from('garbage'),
    Buffer.from([255, 255, 255, 255, 0x41, 1, 2, 3, 4])
  ])
    assert.equal(parseServerInfo(packet), null)
})
test('queries answer an HLDS challenge and time out cleanly', async () => {
  const socket = createSocket('udp4')
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
  const challenge = Buffer.from([1, 2, 3, 4])
  let challenged = false
  socket.on('message', (request, peer) => {
    if (request.length === 25) {
      challenged = true
      socket.send(
        Buffer.concat([Buffer.from([255, 255, 255, 255, 0x41]), challenge]),
        peer.port,
        peer.address
      )
    } else {
      assert.deepEqual(request.subarray(-4), challenge)
      socket.send(modern, peer.port, peer.address)
    }
  })
  try {
    const result = await queryServerInfo('127.0.0.1', socket.address().port, 500)
    assert.equal(challenged, true)
    assert.equal(result.players, 12)
    assert.ok(result.pingMs >= 1)
  } finally {
    socket.close()
  }
  const silent = createSocket('udp4')
  await new Promise((resolve) => silent.bind(0, '127.0.0.1', resolve))
  try {
    assert.equal(await queryServerInfo('127.0.0.1', silent.address().port, 40), null)
  } finally {
    silent.close()
  }
})
test('CS 1.3 uses the legacy details query and cstrk13 folder', async () => {
  const socket = createSocket('udp4')
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
  const legacy = Buffer.concat([
    Buffer.from([255, 255, 255, 255, 0x6d]),
    strings(['127.0.0.1:27015', 'CS1.3 Test Server', 'de_dust2', 'cstrk13', 'Counter-Strike']),
    Buffer.from([0, 12, 48])
  ])
  socket.on('message', (request, peer) => {
    assert.equal(request.toString('latin1'), '\xff\xff\xff\xffdetails\0')
    socket.send(legacy, peer.port, peer.address)
  })
  try {
    assert.equal(parseServerInfo(legacy), null)
    assert.deepEqual(parseServerInfo(legacy, 'cs13'), { map: 'de_dust2', players: 0, maxPlayers: 12 })
    const result = await queryServerInfo('127.0.0.1', socket.address().port, 500, 'cs13')
    assert.equal(result.map, 'de_dust2')
    assert.equal(result.maxPlayers, 12)
  } finally {
    socket.close()
  }
})
test('public address gate blocks local, reserved and multicast UDP targets', () => {
  for (const host of [
    '127.0.0.1',
    '10.1.1.1',
    '172.16.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '198.18.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '999.1.1.1'
  ])
    assert.equal(isPublicIPv4(host), false, host)
  assert.equal(isPublicIPv4('8.8.8.8'), true)
  for (const host of ['10.1.1.1', '172.16.1.1', '192.168.0.123'])
    assert.equal(isLocalPartnerIPv4(host), true)
  for (const host of ['127.0.0.1', '169.254.169.254', '100.64.0.1', '224.0.0.1'])
    assert.equal(isLocalPartnerIPv4(host), false)
})
test('ping first, more players on ties, unknown before full, and stable input', () => {
  const row = (id, pingMs, players, maxPlayers, online = true) => ({
    id,
    name: id,
    host: 'example.test',
    port: 27015,
    map: 'de_dust2',
    pingMs,
    players,
    maxPlayers,
    online
  })
  const rows = [
    row('full', 1, 32, 32),
    row('far', 90, 20, 32),
    row('empty', 30, 0, 32),
    row('active', 30, 20, 32),
    row('offline', null, null, null, false)
  ]
  assert.deepEqual(
    sortPartnerServers(rows).map((row) => row.id),
    ['active', 'empty', 'far', 'offline', 'full']
  )
  assert.equal(rows[0].id, 'full')
})
test('32-character community names, HTTPS socials, server IDs and history bounds', () => {
  const value = {
    communityName: 'A'.repeat(32),
    customSocialLinksEnabled: true,
    socialLinks: { discord: 'https://discord.gg/example' },
    servers: [{ id, name: 'Fixture', host: 'example.test', port: 27015 }]
  }
  assert.equal(parseCommunityBranding(value).communityName.length, 32)
  for (const patch of [
    { communityName: 'A'.repeat(33) },
    { socialLinks: { discord: 'javascript:alert(1)' } },
    { socialLinks: { discord: 'https://user:password@example.test' } },
    { socialLinks: { constructor: 'https://example.test' } },
    { servers: [{ ...value.servers[0], host: 'example.test;+quit' }] },
    { servers: [value.servers[0], value.servers[0]] }
  ])
    assert.throws(() => parseCommunityBranding({ ...value, ...patch }))
  assert.deepEqual(
    parseCommunityHistory({ communityId: null, name: null, messages: [] }).messages,
    []
  )
  assert.throws(() => parseCommunityHistory({ communityId: null, name: null, messages: [{}] }))
})
test('web status rejects unsafe endpoints, commands and malformed ping values', () => {
  const row = {
    id,
    name: 'Arena',
    host: '8.8.8.8',
    port: 27015,
    online: true,
    pingSource: 'api',
    pingMs: 35,
    players: 12,
    maxPlayers: 32,
    map: 'de_dust2'
  }
  assert.equal(parsePartnerServerStatuses({ servers: [row] })[0].pingSource, 'api')
  for (const patch of [
    { port: 0 },
    { host: '8.8.8.8;+quit' },
    { map: 'de_dust2;+quit' },
    { pingMs: Infinity },
    { pingMs: -1 },
    { players: '12' },
    { online: 'yes' },
    { pingSource: 'client' }
  ]) {
    assert.throws(() => parsePartnerServerStatuses({ servers: [{ ...row, ...patch }] }))
  }
})
test('member payloads preserve relationship states and reject unscoped rosters', () => {
  const payload = {
    communityId: id,
    name: 'Community',
    members: [{ id, username: 'Member', relationship: 'INCOMING' }],
    total: 1,
    hasMore: false
  }
  assert.equal(parseCommunityMembers(payload).members[0].relationship, 'INCOMING')
  for (const patch of [
    { communityId: null },
    { total: -1 },
    { hasMore: 'yes' },
    { members: [{ ...payload.members[0], relationship: 'ADMIN' }] },
    { members: Array(51).fill(payload.members[0]) }
  ]) {
    assert.throws(() => parseCommunityMembers({ ...payload, ...patch }))
  }
})
