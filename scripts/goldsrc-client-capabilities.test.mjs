import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  GOLDSRC_COSMETIC_CAPABILITIES,
  classifyGoldSrcClient,
  detectGoldSrcCosmeticFamily,
  WON13_CLIENT_SHA256,
  WON13_ENGINE_SHA256,
  toWinePath,
  fromWinePath
} from '../src/main/game/goldsrc-client-capabilities.ts'

test('WON loader permits managed matches without modern engine-table APIs', () => {
  assert.equal(GOLDSRC_COSMETIC_CAPABILITIES.won13.managedProxyMatches, true)
  assert.equal(GOLDSRC_COSMETIC_CAPABILITIES.won13.modernBlend, false)
  assert.equal(GOLDSRC_COSMETIC_CAPABILITIES.won13.modernJoinRecovery, false)
  assert.equal(GOLDSRC_COSMETIC_CAPABILITIES.cs16.managedProxyMatches, true)
})

test('WON support requires the exact inspected client and engine pair', () => {
  assert.equal(classifyGoldSrcClient('1.3', WON13_CLIENT_SHA256, WON13_ENGINE_SHA256), 'won13')
  assert.equal(classifyGoldSrcClient('1.3', 'unknown', WON13_ENGINE_SHA256), null)
  assert.equal(classifyGoldSrcClient('1.3', WON13_CLIENT_SHA256, 'unknown'), null)
  assert.equal(classifyGoldSrcClient('1.5', WON13_CLIENT_SHA256, WON13_ENGINE_SHA256), null)
  assert.equal(classifyGoldSrcClient('1.6', 'modern', 'modern'), 'cs16')
})

test('modern clients use their ABI contract rather than a DLL hash allowlist', () => {
  for (const hash of ['older-steam', 'current-steam', 'warzone', 'unlisted-modern-build']) {
    assert.equal(classifyGoldSrcClient('1.6', hash, 'modern'), 'cs16')
    assert.equal(classifyGoldSrcClient('', hash, 'modern'), 'cs16')
    assert.equal(classifyGoldSrcClient('1.3', hash, WON13_ENGINE_SHA256), null)
  }
  assert.equal(classifyGoldSrcClient('1.6', WON13_CLIENT_SHA256, WON13_ENGINE_SHA256), null)
})

test('only legacy detection requires client and executable hash inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-family-'))
  try {
    await mkdir(join(root, 'cstrike'))
    await writeFile(join(root, 'cstrike', 'liblist.gam'), 'version "1.6"\n')
    // This stage selects a family only; its caller still validates PE exports.
    assert.equal(await detectGoldSrcCosmeticFamily(root, 'cstrike'), 'cs16')
    await writeFile(join(root, 'cstrike', 'liblist.gam'), 'version "1.3"\n')
    await assert.rejects(detectGoldSrcCosmeticFamily(root, 'cstrike'), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Wine recovery paths round trip spaces without shell syntax or other drives', () => {
  const path = '/home/test/Game files/hl.exe'
  assert.equal(fromWinePath(toWinePath(path)), path)
  for (const invalid of ['C:\\Windows\\file', 'relative', 'Z:relative', 'Z:\\bad\nfile'])
    assert.throws(() => fromWinePath(invalid))
  assert.throws(() => toWinePath('relative'))
  assert.throws(() => toWinePath('/bad\0file'))
})
