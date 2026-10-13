import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePartnerBranding } from '../src/shared/partner-branding.ts'

const origin = 'https://api.example.test'
const partnerId = '12345678-1234-1234-1234-123456789abc'
const branding = {
  partnerId,
  logoUrl: null,
  primaryColor: '#123456',
  secondaryColor: '#abcdef',
  tertiaryColor: '#AA55CC',
  backgroundKind: 'video',
  backgroundUrl: `${origin}/partners/branding/${partnerId}/asset?v=sha256`
}

test('accepts a verified palette and same-origin media URL', () => {
  assert.deepEqual(parsePartnerBranding({ branding }, origin), { branding })
  assert.deepEqual(parsePartnerBranding({ branding: null }, origin), { branding: null })
})

test('rejects malformed colors and background relationships', () => {
  assert.throws(() =>
    parsePartnerBranding({ branding: { ...branding, primaryColor: 'red' } }, origin)
  )
  assert.throws(() =>
    parsePartnerBranding({ branding: { ...branding, backgroundKind: null } }, origin)
  )
  assert.throws(() =>
    parsePartnerBranding({ branding: { ...branding, partnerId: '../bad' } }, origin)
  )
})

test('rejects external, insecure, and unexpected media URLs', () => {
  for (const url of [
    `https://evil.example.test/partners/branding/${partnerId}/asset?v=sha256`,
    `http://api.example.test/partners/branding/${partnerId}/asset?v=sha256`,
    `${origin}/partners/branding/${partnerId}/other?v=sha256`,
    `${origin}/partners/branding/${partnerId}/asset?v=sha256&next=evil`,
    `${origin}/partners/branding/${partnerId}/asset`
  ]) {
    assert.throws(() =>
      parsePartnerBranding({ branding: { ...branding, backgroundUrl: url } }, origin)
    )
  }
})

test('validates partner logos and supports older branding responses', () => {
  const logoUrl = `${origin}/partners/branding/${partnerId}/logo?v=hash`
  assert.equal(
    parsePartnerBranding({ branding: { ...branding, logoUrl } }, origin).branding.logoUrl,
    logoUrl
  )
  const legacy = { ...branding }
  delete legacy.logoUrl
  assert.equal(parsePartnerBranding({ branding: legacy }, origin).branding.logoUrl, null)
  for (const bad of [
    42,
    `https://elsewhere.test/logo.png`,
    `${origin}/partners/branding/${partnerId}/asset?v=hash`,
    `${logoUrl}&next=evil`,
    `http://api.example.test/partners/branding/${partnerId}/logo?v=hash`
  ]) {
    assert.throws(() => parsePartnerBranding({ branding: { ...branding, logoUrl: bad } }, origin))
  }
})
