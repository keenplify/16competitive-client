import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
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
