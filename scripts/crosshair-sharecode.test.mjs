import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeCrosshair } from 'csgo-sharecode'
import {
  getCs2Crosshair,
  importCrosshairShareCode,
  parseCrosshairProfile,
  serializeCrosshairConfig,
  updateCs2Crosshair,
  upgradeCrosshairToCs2
} from '../src/shared/crosshair.ts'

const example = 'CSDcomrJBKpqwRGP3676xoNKTGhHdCOaZ6xY5v5wUQHzyD'

test('imports the current CS2 code and keeps its exact settings', () => {
  const profile = importCrosshairShareCode(example)
  assert.equal(profile.shareCode, example)
  assert.equal(profile.color, '#32FA32')
  assert.deepEqual(
    (({ style, length, gap, thickness, screenHeight, outlineMode }) => ({
      style,
      length,
      gap,
      thickness,
      screenHeight,
      outlineMode
    }))(getCs2Crosshair(profile)),
    { style: 4, length: 2, gap: 0, thickness: 2, screenHeight: 1080, outlineMode: 1 }
  )
  assert.equal(
    serializeCrosshairConfig(profile),
    'cs2 50 250 50 255 0 0 0 255 4 2 0 2 1 0 0 0 1080 255 3 0 100 100 100 0\n'
  )
  assert.equal(parseCrosshairProfile(JSON.parse(JSON.stringify(profile))).shareCode, example)
})

test('edits a CS2 code and rejects corrupted codes', () => {
  const edited = updateCs2Crosshair(importCrosshairShareCode(example), {
    length: 7,
    tStyleEnabled: true
  })
  assert.equal(getCs2Crosshair(edited).length, 7)
  assert.equal(getCs2Crosshair(edited).tStyleEnabled, true)
  assert.throws(() => importCrosshairShareCode(`${example.slice(0, -1)}A`))
})

test('converts a legacy CSGO share code to a current CS2 profile', () => {
  const code = encodeCrosshair({
    format: 'legacy-v1',
    style: 4,
    length: 4,
    gap: 0,
    thickness: 1,
    red: 50,
    green: 250,
    blue: 50,
    alphaEnabled: true,
    alpha: 255,
    outlineEnabled: true,
    outline: 1,
    color: 5,
    centerDotEnabled: false,
    splitDistance: 3,
    followRecoil: false,
    fixedCrosshairGap: 0,
    innerSplitAlpha: 1,
    outerSplitAlpha: 0.5,
    splitSizeRatio: 0.35,
    tStyleEnabled: false,
    deployedWeaponGapEnabled: false
  })
  const profile = importCrosshairShareCode(code)
  assert.match(profile.shareCode, /^CS[A-Za-z0-9]{44}$/)
  assert.equal(getCs2Crosshair(profile)?.format, 'cs2-v1')
  assert.ok(serializeCrosshairConfig(profile).startsWith('cs2 '))
})

test('imports newer five-group crosshair codes and preserves their outline mode', () => {
  const settings = {
    style: 4,
    followRecoil: false,
    centerDotEnabled: true,
    tStyleEnabled: false,
    red: 120,
    green: 240,
    blue: 80,
    alpha: 220,
    gap: 2,
    length: 5,
    thickness: 2,
    dynamicSpreadLimit: 32,
    splitDistance: 3,
    innerSplitAlpha: 1,
    outerSplitAlpha: 0.5,
    splitSizeRatio: 0.35,
    screenHeight: 1080
  }
  for (const value of [
    { ...settings, format: 'legacy-v3', outlineEnabled: true },
    { ...settings, format: 'legacy-v4', outlineMode: 2 }
  ]) {
    const imported = importCrosshairShareCode(encodeCrosshair(value))
    assert.equal(getCs2Crosshair(imported)?.outlineMode, value.format === 'legacy-v4' ? 2 : 1)
    assert.equal(getCs2Crosshair(imported)?.centerDotEnabled, true)
  }
})

test('uses the CSGO cyan preset instead of its unused white RGB fields', () => {
  const code = 'CSGO-PoSkK-9D7Tc-2qmKM-TsHjU-SH3JE'
  const profile = importCrosshairShareCode(code)
  const cs2 = getCs2Crosshair(profile)
  assert.equal(profile.color, '#00FFFF')
  assert.equal(cs2?.style, 4)
  assert.equal(cs2?.followRecoil, false)
  assert.equal(cs2?.centerDotEnabled, false)
  assert.equal(cs2?.length, 2)
  assert.equal(cs2?.thickness, 0)
  assert.equal(cs2?.gap, 0)
  assert.equal(cs2?.outlineMode, 1)
  assert.deepEqual([cs2?.red, cs2?.green, cs2?.blue, cs2?.alpha], [0, 255, 255, 255])
  assert.equal(cs2?.tStyleEnabled, false)
})

test('preserves existing JSON profiles and converts them on request', () => {
  const old = parseCrosshairProfile({
    version: 1,
    color: '#50ff62',
    size: 8,
    gap: 4,
    thickness: 2,
    outline: 1,
    opacity: 100,
    dot: false,
    dynamic: false
  })
  assert.equal(serializeCrosshairConfig(old), '80 255 98 8 4 2 1 100 0 0\n')
  const upgraded = upgradeCrosshairToCs2(old)
  assert.equal(getCs2Crosshair(upgraded).length, 16)
  assert.equal(getCs2Crosshair(upgraded).screenHeight, 768)
})
