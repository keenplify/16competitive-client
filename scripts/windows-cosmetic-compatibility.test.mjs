import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  isNextClientExecutable,
  isNextClientInstallation,
  supportsWindowsCosmeticClient,
  WINDOWS_CLIENT_EXPORTS,
  WINDOWS_STANDALONE_EXECUTABLE_NAMES
} from '../src/main/game/windows-cosmetic-compatibility.ts'

test('includes the official NextClient executable in Windows folder detection', () => {
  assert.deepEqual(WINDOWS_STANDALONE_EXECUTABLE_NAMES, [
    'CS16Launcher.exe',
    'cstrike.exe',
    'hl.exe'
  ])
})

// Synthetic PE32 client: real export-table layout, no executable game code.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function clientFixture(exports = WINDOWS_CLIENT_EXPORTS) {
  const bytes = Buffer.alloc(16384)
  bytes.writeUInt16LE(0x5a4d, 0)
  bytes.writeUInt32LE(0x80, 0x3c)
  bytes.writeUInt32LE(0x4550, 0x80)
  bytes.writeUInt16LE(0x14c, 0x84)
  bytes.writeUInt16LE(1, 0x86)
  bytes.writeUInt16LE(224, 0x94)
  bytes.writeUInt16LE(0x2000, 0x96)
  bytes.writeUInt16LE(0x10b, 0x98)
  bytes.writeUInt32LE(16, 0x98 + 92)
  bytes.writeUInt32LE(0x1000, 0x98 + 96)
  bytes.writeUInt32LE(0x2000, 0x98 + 100)
  const section = 0x98 + 224
  bytes.writeUInt32LE(0x1000, section + 12)
  bytes.writeUInt32LE(0x3e00, section + 16)
  bytes.writeUInt32LE(0x200, section + 20)
  bytes.writeUInt32LE(1, 0x200 + 16)
  bytes.writeUInt32LE(exports.length, 0x200 + 20)
  bytes.writeUInt32LE(exports.length, 0x200 + 24)
  bytes.writeUInt32LE(0x1100, 0x200 + 28)
  bytes.writeUInt32LE(0x1300, 0x200 + 32)
  bytes.writeUInt32LE(0x1500, 0x200 + 36)
  let name = 0x900
  exports.forEach((value, i) => {
    bytes.writeUInt32LE(0x4000 + i, 0x300 + i * 4)
    bytes.writeUInt32LE(name + 0xe00, 0x500 + i * 4)
    bytes.writeUInt16LE(i, 0x700 + i * 2)
    bytes.write(value + '\0', name)
    name += value.length + 1
  })
  return bytes
}

test('accepts compatible client builds regardless of contents or export order', () => {
  const first = clientFixture()
  const updated = clientFixture([...WINDOWS_CLIENT_EXPORTS].reverse())
  updated[0x3200] = 0x42
  assert.equal(supportsWindowsCosmeticClient(first), true)
  assert.equal(supportsWindowsCosmeticClient(updated), true)
})

test('rejects missing required callbacks, x64, and forwarded proxies', () => {
  assert.equal(
    supportsWindowsCosmeticClient(
      clientFixture(WINDOWS_CLIENT_EXPORTS.filter((name) => name !== 'HUD_Redraw'))
    ),
    false
  )
  const x64 = clientFixture()
  x64.writeUInt16LE(0x8664, 0x84)
  assert.equal(supportsWindowsCosmeticClient(x64), false)
  const proxy = clientFixture()
  proxy.writeUInt32LE(0x1700, 0x300)
  assert.equal(supportsWindowsCosmeticClient(proxy), false)
})

test('rejects truncated headers and out-of-bounds export tables without throwing', () => {
  const valid = clientFixture()
  for (const length of [0, 2, 63, 128, 255, 1024])
    assert.equal(supportsWindowsCosmeticClient(valid.subarray(0, length)), false)
  const badNameTable = clientFixture()
  badNameTable.writeUInt32LE(0xffffffff, 0x200 + 32)
  assert.equal(supportsWindowsCosmeticClient(badNameTable), false)
  const badOrdinal = clientFixture()
  badOrdinal.writeUInt16LE(65535, 0x700)
  assert.equal(supportsWindowsCosmeticClient(badOrdinal), false)
})

test('detects NextClient only when both native hook modules are present', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-nextclient-'))
  try {
    assert.equal(await isNextClientInstallation(root), false)
    await mkdir(join(root, 'cstrike', 'cl_dlls'), { recursive: true })
    await writeFile(join(root, 'cstrike', 'cl_dlls', 'client_mini.dll'), '')
    assert.equal(await isNextClientInstallation(root), false)
    await writeFile(join(root, 'nitro_api2.dll'), '')
    assert.equal(await isNextClientInstallation(root), true)
    await writeFile(join(root, 'cstrike.exe'), '')
    assert.equal(await isNextClientExecutable(join(root, 'cstrike.exe')), true)
    assert.equal(await isNextClientExecutable(join(root, 'hl.exe')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
