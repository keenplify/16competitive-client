import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validateMusicBuy,
  parseMusicPurchase,
  musicKitLogoUrls,
  parseMusicKits,
  validateMusicKitId,
  validateMusicTeam
} from '../src/shared/music-kits.ts'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const snapshot = () => ({
  kits: [{ id: 'quake', name: 'Quake', pricePoints: 0, enabled: true, logoPath: null, sounds: {} }],
  ownedIds: ['quake'],
  equipped: { ct: 'quake', t: null }
})

test('team loadouts distinguish the free default from an explicitly cleared slot', () => {
  assert.deepEqual(parseMusicKits(snapshot()).equipped, { ct: 'quake', t: null })
  for (const equipped of [{ ct: 'missing', t: null }, { ct: 'quake' }, null]) {
    assert.throws(() => parseMusicKits({ ...snapshot(), equipped }))
  }
})
test('Music Kit IPC rejects arbitrary teams, traversal and command strings', () => {
  for (const id of ['../quake', 'quake;quit', '/etc/passwd', '', null, 1])
    assert.throws(() => validateMusicKitId(id))
  for (const team of ['CT', 'both', '', null, 1]) assert.throws(() => validateMusicTeam(team))
})
test('untrusted catalog assets cannot supply remote URLs or unsafe paths', () => {
  for (const logoPath of ['https://example.test/logo.png', '../logo.png', 'javascript:alert(1)']) {
    const value = snapshot()
    value.kits[0].logoPath = logoPath
    assert.throws(() => parseMusicKits(value))
  }
  const value = snapshot()
  value.kits[0].logoPath = `media/16competitive/music/${'a'.repeat(64)}/logo.png`
  assert.equal(
    musicKitLogoUrls(parseMusicKits(value), 'https://regional.example.test').kits[0].logoUrl,
    `https://regional.example.test/fastdl/${value.kits[0].logoPath}`
  )
  value.kits[0].sounds = { unknown: 'sound/untrusted.wav' }
  assert.throws(() => parseMusicKits(value))
})

test('BGM accepts only launcher-owned media paths and uses the regional media origin', () => {
  for (const bgmPath of [
    'https://evil.test/music.mp3',
    '../music.mp3',
    'javascript:alert(1)',
    'sound/game.wav'
  ]) {
    const value = snapshot()
    value.kits[0].bgmPath = bgmPath
    assert.throws(() => parseMusicKits(value), /INVALID_MUSIC_BGM/)
  }
  const value = snapshot()
  value.kits[0].bgmPath = `media/16competitive/music/${'b'.repeat(64)}/bgm.mp3`
  assert.equal(
    musicKitLogoUrls(parseMusicKits(value), 'https://warsaw.example.test').kits[0].bgmUrl,
    `https://warsaw.example.test/fastdl/${value.kits[0].bgmPath}`
  )
  assert.equal(parseMusicKits(snapshot()).kits[0].bgmPath, null)
})

test('music pricing accepts legacy catalogs and validates new currencies and balances', () => {
  assert.equal(parseMusicKits(snapshot()).kits[0].pointsEnabled, true)
  const value = snapshot()
  value.kits[0].pointsEnabled = false
  value.kits[0].pricePCash = 150
  assert.equal(parseMusicKits(value).kits[0].pricePCash, 150)
  for (const pricePCash of [-1, 0, 1.5, 1000001, '100']) {
    assert.throws(() => parseMusicKits({ ...value, kits: [{ ...value.kits[0], pricePCash }] }))
  }
  assert.deepEqual(validateMusicBuy(150, 'P_CASH'), { expectedPrice: 150, currency: 'P_CASH' })
  assert.deepEqual(validateMusicBuy(0), { expectedPrice: 0, currency: 'POINTS' })
  for (const currency of ['cash', 'USD', null, {}]) assert.throws(() => validateMusicBuy(1, currency))
  for (const price of [-1, 0.1, '100', NaN, 1000001]) assert.throws(() => validateMusicBuy(price, 'P_CASH'))
  assert.deepEqual(parseMusicPurchase({ points: 12, pCash: 75 }), { points: 12, pCash: 75 })
  assert.deepEqual(parseMusicPurchase({ points: 12 }), { points: 12 })
  assert.throws(() => parseMusicPurchase({ points: -1 }))
  assert.throws(() => parseMusicPurchase({ points: 12, pCash: '75' }))
})
