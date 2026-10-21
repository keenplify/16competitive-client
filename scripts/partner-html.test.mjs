import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parsePartnerUiCatalog,
  parsePartnerUiDisplay,
  partnerUiDocument,
  parsePartnerUiViewport
} from '../src/shared/partner-ui.ts'

const page = {
  key: 'generic',
  html: '<main>Any UI</main>',
  sha256: 'a'.repeat(64),
  width: 640,
  height: 360
}
test('generic page catalog validates byte budgets, dimensions, hashes and unique names', () => {
  assert.deepEqual(parsePartnerUiCatalog({ pages: [page] }), [page])
  for (const bad of [
    { ...page, key: '../x' },
    { ...page, width: 5000 },
    { ...page, height: 0 },
    { ...page, sha256: 'oops' },
    { ...page, html: '界'.repeat(22000) },
    { ...page, html: 'x\0y' }
  ])
    assert.throws(() => parsePartnerUiCatalog({ pages: [bad] }))
  assert.throws(() => parsePartnerUiCatalog({ pages: [page, page] }))
})
test('display commands accept arbitrary JSON but expire and reject malformed connection/hash/data', () => {
  const state = {
    connectionId: '11111111-1111-4111-8111-111111111111',
    sequence: 1,
    key: page.key,
    sha256: page.sha256,
    data: '{"anything":[1,"x",true]}',
    expiresAt: new Date(11000).toISOString()
  }
  assert.deepEqual(parsePartnerUiDisplay({ state }, 10000), state)
  assert.equal(parsePartnerUiDisplay({ state }, 11000), null)
  for (const bad of [
    { ...state, connectionId: 'wrong' },
    { ...state, sha256: null },
    { ...state, data: 'wrong' },
    { ...state, data: JSON.stringify('界'.repeat(2000)) },
    { ...state, sequence: -1 }
  ])
    assert.throws(() => parsePartnerUiDisplay({ state: bad }, 10000))
})
test('untrusted HTML receives a restrictive policy before its first byte', () => {
  const html = '<script>fetch("https://remote.invalid")</script>'
  const document = partnerUiDocument(html)
  assert.ok(document.indexOf('Content-Security-Policy') < document.indexOf(html))
  for (const rule of [
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "worker-src 'none'"
  ])
    assert.ok(document.includes(rule))
})

test('native viewport requires fresh bounded game dimensions', () => {
  assert.deepEqual(parsePartnerUiViewport('v1\n10000\n1920\n1080\n', 11000), {
    width: 1920,
    height: 1080
  })
  for (const text of [
    'v1\n10000\n0\n1080\n',
    'v1\n10000\n99999\n1080\n',
    'v1\n10000\n8192\n8192\n',
    'v1\n12000\n1920\n1080\n',
    'v1\n7000\n1920\n1080\n',
    'v1\n10000\n1920'
  ])
    assert.equal(parsePartnerUiViewport(text, 11000), null)
})
