import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  isNextClientInstallation,
  supportsWindowsCosmeticClient
} from '../src/main/game/windows-cosmetic-compatibility.ts'

test('only the Windows client DLL builds verified by the native proxy are admitted', () => {
  assert.equal(
    supportsWindowsCosmeticClient(
      'ef7a0f40989cb79ba95d40f528534da36866892ee871147ca82e133b7a5edc3d'
    ),
    true
  )
  assert.equal(
    supportsWindowsCosmeticClient(
      '733d4b48a64991d2cd2a60c20d99f72b6533cc401c47f97cc0e6073bd482b6dc'
    ),
    true
  )
  assert.equal(supportsWindowsCosmeticClient('0'.repeat(64)), false)
  assert.equal(
    supportsWindowsCosmeticClient(
      'EF7A0F40989CB79BA95D40F528534DA36866892EE871147CA82E133B7A5EDC3D'
    ),
    false
  )
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
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
